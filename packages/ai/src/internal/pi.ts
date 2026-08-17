import type {Context} from 'effect'
import {
	Array,
	DateTime,
	Effect,
	Encoding,
	HashMap,
	Inspectable,
	Match,
	Option,
	Predicate,
	Queue,
	Record,
	Ref,
	Result,
	Schema,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {
	Agent,
	DEFAULT_COMPACTION_SETTINGS,
	InMemorySessionRepo,
	buildSessionContext,
	compact,
	estimateContextTokens,
	getOrThrow,
	prepareCompaction,
	shouldCompact,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type AgentToolResult
} from '@earendil-works/pi-agent-core'
import type {Api, AssistantMessage, ImageContent, Message, Model, StopReason, TextContent} from '@earendil-works/pi-ai'
import {Type} from '@earendil-works/pi-ai'
import {AiError, Prompt, Response, Tool, type Toolkit} from 'effect/unstable/ai'

import {AiError as ServiceAiError, type AiAgentDefinition, type AiSkill, type AiStatus} from '#schema'
import type {Ai, Pi} from '#service'

function finishReason(reason: StopReason) {
	return pipe(
		Match.value(reason),
		Match.when('stop', () => 'stop' as const),
		Match.when('length', () => 'length' as const),
		Match.when('toolUse', () => 'tool-calls' as const),
		Match.when('pending', () => 'error' as const),
		Match.when('deferred', () => 'pause' as const),
		Match.when('aborted', () => 'other' as const),
		Match.when('error', () => 'error' as const),
		Match.exhaustive
	)
}

function imageDataFromFilePart(part: Prompt.FilePart) {
	if (part.data instanceof URL) return
	if (!Predicate.isString(part.data)) return Encoding.encodeBase64(part.data)
	const prefix = `data:${part.mediaType};base64,`
	return String.startsWith(prefix)(part.data) ? String.slice(String.length(prefix))(part.data) : part.data
}

function imageFromFilePart(part: Prompt.FilePart) {
	if (!String.startsWith('image/')(part.mediaType)) return
	const data = imageDataFromFilePart(part)
	if (Predicate.isUndefined(data)) return
	return {data, mimeType: part.mediaType, type: 'image'} satisfies ImageContent
}

const piContentFromPrompt = Effect.fnUntraced(function* (message: Prompt.UserMessage) {
	return Array.flatten(
		yield* Effect.forEach(message.content, part =>
			pipe(
				Match.value(part),
				Match.when({type: 'text'}, text => Effect.succeed([{text: text.text, type: 'text'} satisfies TextContent])),
				Match.when({type: 'file'}, file =>
					Effect.gen(function* () {
						const image = imageFromFilePart(file)
						if (Predicate.isUndefined(image)) {
							return yield* ServiceAiError.make({
								message:
									file.data instanceof URL
										? 'Pi does not support URL file prompt parts'
										: `Pi does not support ${file.mediaType} file prompt parts`
							})
						}
						return [image]
					})
				),
				Match.orElse(() => Effect.succeed(Array.empty<TextContent | ImageContent>()))
			)
		)
	)
})

const piMessageFromPrompt = Effect.fnUntraced(function* (message: Prompt.UserMessage) {
	return {
		content: yield* piContentFromPrompt(message),
		role: 'user',
		timestamp: DateTime.toEpochMillis(yield* DateTime.now)
	} satisfies Message
})

function textFromUnknown(value: unknown) {
	if (Predicate.isString(value)) return value
	if (Predicate.isUndefined(value)) return 'undefined'
	return Inspectable.toStringUnknown(value)
}

function isPiMessage(message: AgentMessage): message is Message {
	return message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'
}

function promptMessageFromPi(message: Message): Prompt.Message {
	if (message.role === 'user') {
		const content = Predicate.isString(message.content)
			? [Prompt.makePart('text', {text: message.content})]
			: pipe(
					message.content,
					Array.map(part =>
						part.type === 'text'
							? Prompt.makePart('text', {text: part.text})
							: Prompt.makePart('file', {data: part.data, mediaType: part.mimeType})
					)
				)
		return Prompt.makeMessage('user', {content})
	}

	if (message.role === 'toolResult') {
		return Prompt.makeMessage('tool', {
			content: [
				Prompt.makePart('tool-result', {
					id: message.toolCallId,
					isFailure: message.isError,
					name: message.toolName,
					providerExecuted: false,
					result: message.details ?? message.content
				})
			]
		})
	}

	const content = pipe(
		message.content,
		Array.filterMap(part =>
			pipe(
				Match.value(part),
				Match.when({type: 'text'}, text => Result.succeed(Prompt.makePart('text', {text: text.text}))),
				Match.when({type: 'thinking'}, thinking =>
					Result.succeed(Prompt.makePart('reasoning', {text: thinking.thinking}))
				),
				Match.when({type: 'toolCall'}, call =>
					Result.succeed(
						Prompt.makePart('tool-call', {
							id: call.id,
							name: call.name,
							params: call.arguments,
							providerExecuted: false
						})
					)
				),
				Match.orElse(() => Result.failVoid)
			)
		)
	)
	return Prompt.makeMessage('assistant', {content})
}

function toolResult(value: unknown) {
	return {content: [{text: textFromUnknown(value), type: 'text'}], details: value} satisfies AgentToolResult<unknown>
}

function effectToolsFromToolkit<ToolSet extends Ai.Tools>(
	toolkit: Toolkit.WithHandler<ToolSet>,
	context: Context.Context<Tool.HandlerServices<ToolSet[keyof ToolSet]>>,
	names: (keyof ToolSet & string)[]
) {
	function hasParameters<Name extends keyof ToolSet & string>(
		name: Name,
		params: unknown
	): params is Tool.Parameters<ToolSet[Name]> {
		const selected = pipe(toolkit.tools[name], Option.fromUndefinedOr, Option.getOrThrow)
		return Schema.is(selected.parametersSchema)(params)
	}

	return Array.map(names, name => {
		const tool = pipe(toolkit.tools[name], Option.fromUndefinedOr, Option.getOrThrow)
		const parameters = Type.Unsafe<unknown>(Tool.getJsonSchema(tool))
		const definition: AgentTool = {
			description: Predicate.isString(tool.description) ? tool.description : name,
			execute: (toolCallId, params, _signal, onUpdate) => {
				const execution = hasParameters(name, params)
					? toolkit.handle(name, params, toolCallId)
					: Effect.fail(
							AiError.make({
								method: `${name}.handle`,
								module: 'Pi',
								reason: AiError.ToolParameterValidationError.make({
									description: 'Tool parameters do not match the configured schema',
									toolName: name,
									toolParams: params
								})
							})
						)
				return Effect.runPromiseWith(context)(
					pipe(
						execution,
						Effect.flatMap(stream =>
							pipe(
								stream,
								Stream.tap(result =>
									result.preliminary ? Effect.sync(() => onUpdate?.(toolResult(result.encodedResult))) : Effect.void
								),
								Stream.filter(result => !result.preliminary),
								Stream.runLast
							)
						),
						Effect.map(Option.map(result => result.encodedResult)),
						Effect.map(value => toolResult(Option.getOrUndefined(value)))
					)
				)
			},
			executionMode: name === 'write' || name === 'edit' ? ('sequential' as const) : ('parallel' as const),
			label: name,
			name,
			parameters
		}
		return definition
	})
}

function formatSkills(skills: AiSkill[]) {
	if (Array.length(skills) === 0) return ''
	return Array.join('\n')([
		'The skill tool exposes specialized instructions. Invoke a skill when its description matches the task.',
		'<available_skills>',
		...Array.map(
			skills,
			skill => `  <skill><name>${skill.name}</name><description>${skill.description}</description></skill>`
		),
		'</available_skills>'
	])
}

function formatAgents(agents: AiAgentDefinition[]) {
	if (Array.length(agents) === 0) return ''
	return Array.join('\n')([
		'The subagent tool delegates one focused task to an isolated agent.',
		'<available_agents>',
		...Array.map(
			agents,
			agent => `  <agent><name>${agent.name}</name><description>${agent.description}</description></agent>`
		),
		'</available_agents>'
	])
}

function systemPrompt(profile: AiAgentDefinition, agents: AiAgentDefinition[]) {
	return pipe(
		[profile.instructions, formatSkills(Array.fromIterable(profile.skills)), formatAgents(agents)],
		Array.filter(String.isNonEmpty),
		Array.join('\n\n')
	)
}

function skillTool(skills: AiSkill[], context: Context.Context<never>) {
	const names = Array.map(skills, skill => skill.name)
	const parameters = Type.Object({name: Type.String({enum: names})})
	const definition: AgentTool = {
		description: 'Load the complete instructions and embedded resources for one available skill.',
		execute: (_toolCallId, params) =>
			Effect.runPromiseWith(context)(
				Effect.gen(function* () {
					const input = yield* Schema.decodeUnknownEffect(Schema.Struct({name: Schema.String}))(params)
					const skill = Array.findFirst(skills, candidate => candidate.name === input.name)
					if (Option.isNone(skill)) return yield* ServiceAiError.make({message: `Unknown skill: ${input.name}`})
					const resources = Predicate.isUndefined(skill.value.resources)
						? ''
						: `\n\n<resources>\n${pipe(
								Record.toEntries(skill.value.resources),
								Array.map(([name, content]) => `<resource name="${name}">\n${content}\n</resource>`),
								Array.join('\n')
							)}</resources>`
					return toolResult(`${skill.value.instructions}${resources}`)
				})
			),
		label: 'skill',
		name: 'skill',
		parameters
	}
	return definition
}

function assistantText(messages: AgentMessage[]) {
	const last = Array.findLast(messages, message => message.role === 'assistant')
	if (Option.isNone(last)) return ''
	return pipe(
		last.value.content,
		Array.filterMap(part => (part.type === 'text' ? Result.succeed(part.text) : Result.failVoid)),
		Array.join('\n')
	)
}

function usageFromMessage(message: AssistantMessage) {
	return Response.Usage.make({
		inputTokens: {
			cacheRead: message.usage.cacheRead,
			cacheWrite: message.usage.cacheWrite,
			total: message.usage.input,
			uncached: message.usage.input - message.usage.cacheRead
		},
		outputTokens: {reasoning: message.usage.reasoning, text: message.usage.output, total: message.usage.output}
	})
}

function partsFromEvent<ToolSet extends Ai.Tools>(event: AgentEvent) {
	if (event.type === 'message_update') {
		const update = event.assistantMessageEvent
		if (update.type === 'text_delta' && update.delta !== '') {
			return [Response.makePart('text-delta', {delta: update.delta, id: update.partial.responseId ?? 'text'})]
		}
		if (update.type === 'thinking_delta' && update.delta !== '') {
			return [Response.makePart('reasoning-delta', {delta: update.delta, id: update.partial.responseId ?? 'reasoning'})]
		}
		if (update.type === 'toolcall_end') {
			return [
				Response.makePart('tool-call', {
					id: update.toolCall.id,
					name: update.toolCall.name,
					params: update.toolCall.arguments,
					providerExecuted: false
				})
			]
		}
	}
	if (event.type === 'tool_execution_update') {
		return [
			Response.makePart('tool-result', {
				encodedResult: event.partialResult,
				id: event.toolCallId,
				isFailure: false,
				name: event.toolName,
				preliminary: true,
				providerExecuted: false,
				result: event.partialResult
			})
		]
	}
	if (event.type === 'tool_execution_end') {
		return [
			Response.makePart('tool-result', {
				encodedResult: event.result,
				id: event.toolCallId,
				isFailure: event.isError,
				name: event.toolName,
				preliminary: false,
				providerExecuted: false,
				result: event.result
			})
		]
	}
	if (event.type === 'message_end' && event.message.role === 'assistant') {
		return [
			Response.makePart('response-metadata', {
				id: event.message.responseId,
				modelId: event.message.model,
				request: undefined,
				timestamp: undefined
			})
		]
	}
	return Array.empty<Response.StreamPart<ToolSet>>()
}

function finishPart(message: AgentMessage) {
	return Response.makePart('finish', {
		reason: message.role === 'assistant' ? finishReason(message.stopReason) : 'stop',
		response: undefined,
		usage:
			message.role === 'assistant'
				? usageFromMessage(message)
				: Response.Usage.make({
						inputTokens: {cacheRead: undefined, cacheWrite: undefined, total: undefined, uncached: undefined},
						outputTokens: {reasoning: undefined, text: undefined, total: undefined}
					})
	})
}

export const makePi = Effect.fnUntraced(function* <ToolSet extends Ai.Tools>(config: Pi.Config<ToolSet>) {
	const status = yield* SubscriptionRef.make<AiStatus>({state: 'idle', updatedAt: yield* DateTime.now})
	const model = yield* SubscriptionRef.make(config.model)
	const history = yield* SubscriptionRef.make<Prompt.Message[]>([])
	const promptLock = yield* Semaphore.make(1)
	const handledToolkit = yield* config.toolkit
	const toolContext = yield* Effect.context<Tool.HandlerServices<ToolSet[keyof ToolSet]>>()
	const initialModel = config.models.getModel(config.model.provider, config.model.id)
	if (Predicate.isUndefined(initialModel)) {
		return yield* ServiceAiError.make({message: `Unknown model: ${config.model.id}`})
	}
	let activeModel: Model<Api> = initialModel
	const agentDefinitions = config.agents ?? []
	const definitions = pipe(
		agentDefinitions,
		Array.map(definition => [definition.name, definition] as const),
		HashMap.fromIterable
	)
	const sessions = config.session?.repository ?? new InMemorySessionRepo()

	const ownerContext = yield* Effect.context()
	const makeRuntime = Effect.fnUntraced(function* (
		profile: AiAgentDefinition,
		allowSubagents: boolean,
		resumeId?: string
	) {
		const session = yield* Predicate.isUndefined(resumeId)
			? Effect.tryPromise({
					catch: cause => ServiceAiError.make({cause, message: 'Failed to create Pi session'}),
					try: () => sessions.create({})
				})
			: Effect.gen(function* () {
					const metadata = pipe(
						yield* Effect.tryPromise({
							catch: cause => ServiceAiError.make({cause, message: 'Failed to find Pi session'}),
							try: () => sessions.list()
						}),
						Array.findFirst(candidate => candidate.id === resumeId)
					)
					if (Option.isNone(metadata)) {
						return yield* ServiceAiError.make({message: `Unknown Pi session: ${resumeId}`})
					}
					return yield* Effect.tryPromise({
						catch: cause => ServiceAiError.make({cause, message: 'Failed to open Pi session'}),
						try: () => sessions.open(metadata.value)
					})
				})
		const initialMessages = pipe(
			yield* Effect.tryPromise({
				catch: cause => ServiceAiError.make({cause, message: 'Failed to read Pi session'}),
				try: () => session.findEntriesOnBranch()
			}),
			buildSessionContext,
			context => context.messages
		)
		const enabledNames = pipe(
			Record.keys(handledToolkit.tools),
			Array.filter(name => Array.some(profile.tools, configured => configured === name))
		)
		if (Array.length(enabledNames) !== Array.length(profile.tools)) {
			return yield* ServiceAiError.make({message: `Agent ${profile.name} enables an unknown tool`})
		}
		const baseTools = effectToolsFromToolkit(handledToolkit, toolContext, enabledNames)
		let tools: AgentTool[] =
			Array.length(profile.skills) > 0
				? [...baseTools, skillTool(Array.fromIterable(profile.skills), ownerContext)]
				: baseTools
		if (allowSubagents && Array.length(agentDefinitions) > 0) {
			const parameters = Type.Object({
				agent: Type.String({enum: Array.map(agentDefinitions, definition => definition.name)}),
				prompt: Type.String({description: 'Focused task for the selected agent'})
			})
			const subagent: AgentTool = {
				description: 'Run one focused prompt with an isolated configured agent and return its final answer.',
				execute: (_toolCallId: string, params) =>
					Effect.runPromiseWith(ownerContext)(
						Effect.gen(function* () {
							const input = yield* Schema.decodeUnknownEffect(
								Schema.Struct({agent: Schema.String, prompt: Schema.String})
							)(params)
							const definition = HashMap.get(definitions, input.agent)
							if (Option.isNone(definition)) {
								return yield* ServiceAiError.make({message: `Unknown agent: ${input.agent}`})
							}
							const child = yield* makeRuntime(definition.value, false)
							yield* Effect.tryPromise({
								catch: cause => ServiceAiError.make({cause, message: `Subagent ${input.agent} failed`}),
								try: () => child.agent.prompt(input.prompt)
							})
							return toolResult(assistantText(child.agent.state.messages))
						})
					),
				label: 'subagent',
				name: 'subagent',
				parameters
			}
			tools = [...tools, subagent]
		}

		function compactContext(messages: AgentMessage[], signal?: AbortSignal) {
			return Effect.runPromiseWith(ownerContext)(
				pipe(
					Effect.gen(function* () {
						const entries = yield* Effect.tryPromise({
							catch: cause => ServiceAiError.make({cause, message: 'Failed to read Pi session for compaction'}),
							try: () => session.findEntriesOnBranch()
						})
						const current = buildSessionContext(entries).messages
						const usage = estimateContextTokens(current)
						if (!shouldCompact(usage.tokens, activeModel.contextWindow, DEFAULT_COMPACTION_SETTINGS)) return current
						const preparation = getOrThrow(prepareCompaction(entries, DEFAULT_COMPACTION_SETTINGS))
						if (Predicate.isUndefined(preparation)) return current
						const result = getOrThrow(
							yield* Effect.tryPromise({
								catch: cause => ServiceAiError.make({cause, message: 'Pi compaction failed'}),
								try: () => compact(preparation, config.models, activeModel, undefined, signal, config.model.reasoning)
							})
						)
						yield* Effect.tryPromise({
							catch: cause => ServiceAiError.make({cause, message: 'Failed to persist Pi compaction'}),
							try: () =>
								session.appendEntry(
									{
										details: result.details,
										id: session.idGenerator.next(),
										retainedTail: result.retainedTail,
										summary: result.summary,
										tokensBefore: result.tokensBefore,
										type: 'compaction',
										usage: result.usage
									},
									'main'
								)
						})
						const compacted = yield* Effect.tryPromise({
							catch: cause => ServiceAiError.make({cause, message: 'Failed to read compacted Pi session'}),
							try: () => session.findEntriesOnBranch()
						})
						return buildSessionContext(compacted).messages
					}),
					Effect.orElseSucceed(() => messages)
				)
			)
		}

		const agent = new Agent({
			...config.options,
			initialState: {
				messages: initialMessages,
				model: activeModel,
				systemPrompt: systemPrompt(profile, allowSubagents ? agentDefinitions : []),
				thinkingLevel: config.model.reasoning,
				tools
			},
			sessionId: (yield* Effect.tryPromise({
				catch: cause => ServiceAiError.make({cause, message: 'Failed to read Pi session metadata'}),
				try: () => session.getMetadata()
			})).id,
			streamFn: config.models.streamSimple.bind(config.models),
			toolExecution: config.options?.toolExecution ?? 'parallel',
			transformContext: config.options?.transformContext ?? compactContext
		})
		agent.subscribe(event => {
			if (event.type !== 'message_end') return
			return Effect.runPromiseWith(ownerContext)(
				pipe(
					Effect.promise(() => session.appendMessage(event.message)),
					Effect.asVoid
				)
			)
		})
		return {agent, session}
	})

	const runtime = yield* makeRuntime(config.main, true, config.session?.id)
	const sessionId = {agent: 'pi' as const, id: (yield* Effect.promise(() => runtime.session.getMetadata())).id}
	yield* pipe(runtime.agent.state.messages, Array.filter(isPiMessage), Array.map(promptMessageFromPi), messages =>
		SubscriptionRef.set(history, messages)
	)
	const setStatus = Effect.fnUntraced(function* (state: AiStatus['state']) {
		yield* SubscriptionRef.set(status, {state, updatedAt: yield* DateTime.now})
	})

	const historyUnsubscribe = runtime.agent.subscribe(event => {
		if (event.type !== 'message_end' || !isPiMessage(event.message)) return
		const message = event.message
		return Effect.runPromiseWith(ownerContext)(
			SubscriptionRef.update(history, messages => [...messages, promptMessageFromPi(message)])
		)
	})
	yield* Effect.addFinalizer(() =>
		Effect.sync(() => {
			historyUnsubscribe()
			runtime.agent.abort()
		})
	)

	yield* pipe(
		SubscriptionRef.changes(model),
		Stream.runForEach(next =>
			Effect.gen(function* () {
				const resolved = config.models.getModel(next.provider, next.id)
				if (Predicate.isUndefined(resolved)) {
					yield* setStatus('error')
					return
				}
				activeModel = resolved
				runtime.agent.state.model = resolved
				runtime.agent.state.thinkingLevel = next.reasoning
			})
		),
		Effect.forkScoped
	)

	const deliver = Effect.fnUntraced(function* (message: Prompt.UserMessage, mode: 'prompt' | 'queue' | 'steer') {
		const piMessage = yield* piMessageFromPrompt(message)
		if (mode === 'prompt') {
			yield* Effect.tryPromise({
				catch: cause => ServiceAiError.make({cause, message: 'Pi prompt failed'}),
				try: () => runtime.agent.prompt(piMessage)
			})
			return
		}
		if (!runtime.agent.state.isStreaming) {
			return yield* ServiceAiError.make({message: `Cannot ${mode} while Pi is idle`})
		}
		runtime.agent[mode === 'steer' ? 'steer' : 'followUp'](piMessage)
	})

	return {
		history,
		model,
		prompt: message =>
			Stream.callback<Response.StreamPart<ToolSet>, ServiceAiError>(queue =>
				pipe(
					Effect.gen(function* () {
						if (runtime.agent.state.isStreaming) {
							yield* Queue.offer(queue, Response.makePart('error', {error: 'Pi is already running'}))
							yield* Queue.end(queue)
							return
						}
						yield* setStatus('running')
						const final = yield* Ref.make(Option.none<ReturnType<typeof finishPart>>())
						const unsubscribe = runtime.agent.subscribe(event =>
							Effect.runPromiseWith(ownerContext)(
								Effect.gen(function* () {
									yield* Effect.forEach(partsFromEvent<ToolSet>(event), part => Queue.offer(queue, part), {
										discard: true
									})
									if (event.type === 'turn_end') yield* Ref.set(final, Option.some(finishPart(event.message)))
									if (event.type !== 'agent_end') return
									yield* pipe(
										yield* Ref.get(final),
										Option.match({onNone: () => Effect.void, onSome: part => Queue.offer(queue, part)})
									)
									yield* setStatus('idle')
									yield* Queue.end(queue)
								})
							)
						)
						yield* Effect.addFinalizer(() =>
							Effect.sync(() => {
								unsubscribe()
								runtime.agent.abort()
							})
						)
						yield* pipe(
							deliver(message, 'prompt'),
							Effect.catch(error =>
								Effect.gen(function* () {
									yield* setStatus('error')
									yield* Queue.offer(queue, Response.makePart('error', {error: error.message}))
									yield* Queue.end(queue)
								})
							)
						)
					}),
					Semaphore.withPermit(promptLock),
					Effect.withSpan('Ai.prompt')
				)
			),
		queue: message => pipe(deliver(message, 'queue'), Effect.withSpan('Ai.queue')),
		sessionId,
		status,
		steer: message => pipe(deliver(message, 'steer'), Effect.withSpan('Ai.steer'))
	} satisfies Ai['Service']
})
