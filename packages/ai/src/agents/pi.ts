import type {Record} from 'effect'
import {
	Array,
	DateTime,
	Effect,
	Encoding,
	Match,
	Option,
	Predicate,
	Queue,
	Ref,
	Schema,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {getModel} from '@earendil-works/pi-ai'
import type {AssistantMessage, ImageContent, Message, TextContent, ToolResultMessage} from '@earendil-works/pi-ai'
import type {AgentSessionEvent} from '@earendil-works/pi-coding-agent'
import {DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir} from '@earendil-works/pi-coding-agent'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import type {AgentLayerConfig, AgentPrompt, AgentStatus} from '../schema.ts'
import {AiError} from '../schema.ts'

function finishReason(reason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted') {
	return pipe(
		Match.value(reason),
		Match.when('stop', () => 'stop' as const),
		Match.when('length', () => 'length' as const),
		Match.when('error', () => 'error' as const),
		Match.when('toolUse', () => 'tool-calls' as const),
		Match.when('aborted', () => 'error' as const),
		Match.exhaustive
	)
}

function imageDataFromFilePart(part: Prompt.FilePart) {
	if (part.data instanceof URL) return
	if (!Predicate.isString(part.data)) return Encoding.encodeBase64(part.data)

	const dataUrlPrefix = `data:${part.mediaType};base64,`
	return String.startsWith(dataUrlPrefix)(part.data) ? String.slice(String.length(dataUrlPrefix))(part.data) : part.data
}

function imageFromFilePart(part: Prompt.FilePart) {
	if (!String.startsWith('image/')(part.mediaType)) return
	const data = imageDataFromFilePart(part)
	if (Predicate.isUndefined(data)) return
	return {data, mimeType: part.mediaType, type: 'image'} satisfies ImageContent
}

function textFromResult(result: unknown) {
	if (Predicate.isString(result)) return result
	if (Predicate.isUndefined(result)) return 'undefined'
	return Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(result)
}

function toolArgumentsFromParams(params: unknown) {
	if (!Predicate.isObject(params)) return
	return params as Record<string, unknown>
}

const piContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.Part[]) {
	return Array.flatten(
		yield* Effect.forEach(parts, part =>
			pipe(
				Match.value(part),
				Match.when({type: 'text'}, textPart =>
					Effect.succeed([{text: textPart.text, type: 'text'} satisfies TextContent])
				),
				Match.when({type: 'file'}, filePart =>
					Effect.gen(function* () {
						const image = imageFromFilePart(filePart)
						if (Predicate.isUndefined(image)) {
							return yield* new AiError({
								message:
									filePart.data instanceof URL
										? 'Pi agent does not support URL file prompt parts'
										: `Pi agent does not support ${filePart.mediaType} file prompt parts`
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

const piAssistantContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.AssistantMessagePart[]) {
	if (Array.some(parts, part => part.type === 'file' || part.type === 'tool-approval-request')) return

	return Array.flatten(
		yield* Effect.forEach(parts, part =>
			pipe(
				Match.value(part),
				Match.when({type: 'text'}, textPart =>
					Effect.succeed([{text: textPart.text, type: 'text'} satisfies AssistantMessage['content'][number]])
				),
				Match.when({type: 'reasoning'}, reasoningPart =>
					Effect.succeed([
						{thinking: reasoningPart.text, type: 'thinking'} satisfies AssistantMessage['content'][number]
					])
				),
				Match.when({type: 'tool-call'}, toolCallPart =>
					Effect.gen(function* () {
						const args = toolArgumentsFromParams(toolCallPart.params)
						if (Predicate.isUndefined(args)) {
							return yield* new AiError({
								message: `Pi agent cannot restore non-object tool call params for ${toolCallPart.name}`
							})
						}
						return [
							{
								arguments: args,
								id: toolCallPart.id,
								name: toolCallPart.name,
								type: 'toolCall'
							} satisfies AssistantMessage['content'][number]
						]
					})
				),
				Match.orElse(() => Effect.succeed(Array.empty<AssistantMessage['content'][number]>()))
			)
		)
	)
})

const piToolResultsFromPromptParts = Effect.fnUntraced(function* (
	parts: readonly (Prompt.ToolResultPart | Prompt.ToolApprovalResponsePart)[]
) {
	return yield* Effect.forEach(parts, part =>
		pipe(
			Match.value(part),
			Match.when({type: 'tool-approval-response'}, () =>
				Effect.fail(new AiError({message: 'Pi agent does not support tool approval response prompt parts'}))
			),
			Match.orElse(toolResultPart =>
				Effect.succeed({
					content: [{text: textFromResult(toolResultPart.result), type: 'text'}],
					isError: toolResultPart.isFailure,
					role: 'toolResult',
					timestamp: Date.now(),
					toolCallId: toolResultPart.id,
					toolName: toolResultPart.name
				} satisfies ToolResultMessage)
			)
		)
	)
})

const piMessagesFromPromptHistory = Effect.fnUntraced(function* (
	messages: readonly Prompt.Message[],
	input: AgentPrompt,
	currentUserMessage: Prompt.UserMessage
) {
	const history = Array.flatten(
		yield* Effect.forEach(Array.dropRight(messages, 1), message =>
			pipe(
				Match.value(message),
				Match.when({role: 'system'}, () => Effect.succeed(Array.empty<Message>())),
				Match.when({role: 'user'}, userMessage =>
					Effect.gen(function* () {
						return [
							{
								content: yield* piContentFromPromptParts(userMessage.content),
								role: 'user',
								timestamp: Date.now()
							} satisfies Message
						]
					})
				),
				Match.when({role: 'assistant'}, assistantMessage =>
					Effect.gen(function* () {
						const content = yield* piAssistantContentFromPromptParts(assistantMessage.content)
						if (Predicate.isUndefined(content)) {
							return yield* new AiError({message: 'Pi agent does not support assistant file or approval prompt parts'})
						}
						const toolResults = yield* piToolResultsFromPromptParts(
							Array.filter(assistantMessage.content, part => part.type === 'tool-result')
						)

						return [
							{
								api: 'openai-codex-responses',
								content,
								model: input.model,
								provider: input.provider,
								role: 'assistant',
								stopReason: Array.some(content, part => part.type === 'toolCall') ? 'toolUse' : 'stop',
								timestamp: Date.now(),
								usage: {
									cacheRead: 0,
									cacheWrite: 0,
									cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0},
									input: 0,
									output: 0,
									totalTokens: 0
								}
							} satisfies Message,
							...toolResults
						]
					})
				),
				Match.when({role: 'tool'}, toolMessage => piToolResultsFromPromptParts(toolMessage.content)),
				Match.exhaustive
			)
		)
	)

	return {history, prompt: yield* piContentFromPromptParts(currentUserMessage.content)}
})

function partFromEvent(event: AgentSessionEvent) {
	return pipe(
		Match.value(event),
		Match.when({type: 'message_update'}, messageEvent =>
			pipe(
				Match.value(messageEvent.assistantMessageEvent),
				Match.when({type: 'text_delta'}, update =>
					update.delta === ''
						? Array.empty<Response.StreamPart<Toolkit.Any['tools']>>()
						: [Response.makePart('text-delta', {delta: update.delta, id: update.partial.responseId ?? 'text'})]
				),
				Match.when({type: 'thinking_delta'}, update =>
					update.delta === ''
						? Array.empty<Response.StreamPart<Toolkit.Any['tools']>>()
						: [
								Response.makePart('reasoning-delta', {
									delta: update.delta,
									id: update.partial.responseId ?? 'reasoning'
								})
							]
				),
				Match.when({type: 'toolcall_end'}, update => [
					Response.makePart('tool-call', {
						id: update.toolCall.id,
						name: update.toolCall.name,
						params: update.toolCall.arguments,
						providerExecuted: false
					})
				]),
				Match.orElse(() => Array.empty<Response.StreamPart<Toolkit.Any['tools']>>())
			)
		),
		Match.when({type: 'tool_execution_end'}, toolEvent => [
			Response.makePart('tool-result', {
				encodedResult: toolEvent.result,
				id: toolEvent.toolCallId,
				isFailure: toolEvent.isError,
				name: toolEvent.toolName,
				preliminary: false,
				providerExecuted: false,
				result: toolEvent.result
			})
		]),
		Match.when({type: 'message_end'}, messageEvent =>
			messageEvent.message.role === 'assistant'
				? [
						Response.makePart('response-metadata', {
							id: messageEvent.message.responseId,
							modelId: messageEvent.message.model,
							request: undefined,
							timestamp: undefined
						})
					]
				: Array.empty<Response.StreamPart<Toolkit.Any['tools']>>()
		),
		Match.when({type: 'auto_retry_start'}, retryEvent => [
			Response.makePart('error', {error: retryEvent.errorMessage})
		]),
		Match.when({type: 'compaction_end'}, compactionEvent =>
			Predicate.isNotUndefined(compactionEvent.errorMessage)
				? [Response.makePart('error', {error: compactionEvent.errorMessage})]
				: Array.empty<Response.StreamPart<Toolkit.Any['tools']>>()
		),
		Match.orElse(() => Array.empty<Response.StreamPart<Toolkit.Any['tools']>>())
	)
}

function finishPartFromTurnEnd(event: Extract<AgentSessionEvent, {type: 'turn_end'}>) {
	return Response.makePart('finish', {
		reason: event.message.role === 'assistant' ? finishReason(event.message.stopReason) : 'stop',
		response: undefined,
		usage:
			event.message.role === 'assistant'
				? new Response.Usage({
						inputTokens: {
							cacheRead: event.message.usage.cacheRead,
							cacheWrite: event.message.usage.cacheWrite,
							total: event.message.usage.input,
							uncached: event.message.usage.input - event.message.usage.cacheRead
						},
						outputTokens: {reasoning: undefined, text: event.message.usage.output, total: event.message.usage.output}
					})
				: new Response.Usage({
						inputTokens: {cacheRead: undefined, cacheWrite: undefined, total: undefined, uncached: undefined},
						outputTokens: {reasoning: undefined, text: undefined, total: undefined}
					})
	})
}

export const makeLayerPi = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const status = yield* SubscriptionRef.make<AgentStatus>({state: 'idle', updatedAt: yield* DateTime.now})
	const history = yield* Ref.make<readonly Prompt.Message[]>([])
	const promptLock = yield* Semaphore.make(1)

	const setStatus = Effect.fnUntraced(function* (state: AgentStatus['state']) {
		yield* SubscriptionRef.set(status, {state, updatedAt: yield* DateTime.now})
	})

	const session = Effect.fnUntraced(function* (input: AgentPrompt) {
		const model = getModel(input.provider, input.model)
		const noTools = config.tools === 'none' ? 'all' : undefined
		const tools = pipe(
			Match.value(config.tools),
			Match.when('all', () => ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']),
			Match.when('none', () => undefined as string[] | undefined),
			Match.when(undefined, () => undefined as string[] | undefined),
			Match.orElse(selectedTools => [...selectedTools])
		)
		const resourceLoader = new DefaultResourceLoader({
			agentDir: getAgentDir(),
			appendSystemPromptOverride: () => [],
			cwd: config.cwd,
			systemPromptOverride: () => config.systemPrompt.content
		})
		yield* Effect.tryPromise({
			catch: cause => new AiError({cause, message: 'failed to load pi agent resources'}),
			try: () => resourceLoader.reload()
		})
		const currentUserMessage = pipe(
			input.messages,
			Array.findLast(message => message.role === 'user'),
			Option.getOrUndefined
		)
		const lastMessage = pipe(input.messages, Array.last, Option.getOrUndefined)
		if (Predicate.isUndefined(currentUserMessage) || lastMessage !== currentUserMessage) {
			return yield* new AiError({message: 'Pi agent prompts must end with a user message'})
		}
		const prompt = yield* piMessagesFromPromptHistory(input.messages, input, currentUserMessage)
		const sessionManager = SessionManager.inMemory(config.cwd)
		for (const message of prompt.history) {
			sessionManager.appendMessage(message)
		}
		const result = yield* Effect.tryPromise({
			catch: cause => new AiError({cause, message: 'failed to create pi agent session'}),
			try: () =>
				createAgentSession({
					cwd: config.cwd,
					model,
					noTools,
					resourceLoader,
					sessionManager,
					thinkingLevel: input.thinkingLevel ?? 'low',
					tools
				})
		})

		yield* Effect.addFinalizer(() =>
			Effect.sync(() => {
				result.session.dispose()
			})
		)
		return {prompt, session: result.session}
	})

	return {
		history: Ref.get(history),
		prompt: (input: AgentPrompt) =>
			Stream.callback<Response.StreamPart<Toolkit.Any['tools']>, AiError>(queue =>
				pipe(
					Effect.gen(function* () {
						yield* Effect.annotateCurrentSpan({
							cwd: config.cwd,
							messageCount: input.messages.length,
							model: input.model,
							provider: input.provider,
							thinkingLevel: input.thinkingLevel ?? 'default'
						})
						const current = yield* session(input)
						const events = yield* Queue.bounded<AgentSessionEvent>(1_024)
						const finished = yield* Ref.make(false)
						const finishPart = yield* Ref.make<Response.StreamPart<Toolkit.Any['tools']> | undefined>(void 0)
						const overflowed = yield* Ref.make(false)
						yield* Ref.set(history, input.messages)
						yield* setStatus('running')
						const unsubscribe = current.session.subscribe(event => {
							if (Queue.offerUnsafe(events, event)) return

							void current.session.abort()
							Effect.runFork(
								Effect.gen(function* () {
									const alreadyOverflowed = yield* Ref.getAndSet(overflowed, true)
									if (alreadyOverflowed) return

									yield* Ref.set(finished, true)
									yield* setStatus('error')
									yield* Queue.offer(queue, Response.makePart('error', {error: 'agent event queue overflow'}))
									yield* Queue.end(queue)
								})
							)
						})
						yield* Effect.addFinalizer(() =>
							pipe(
								Effect.gen(function* () {
									yield* Effect.sync(unsubscribe)
									const completed = yield* Ref.get(finished)
									if (completed) return

									yield* setStatus('stopping')
									yield* Effect.tryPromise({
										catch: cause => new AiError({cause, message: 'failed to abort agent'}),
										try: () => current.session.abort()
									})
									yield* setStatus('idle')
								}),
								Effect.catch(() => setStatus('idle'))
							)
						)
						yield* Effect.forkScoped(
							Effect.forever(
								pipe(
									Queue.take(events),
									Effect.flatMap(event =>
										Effect.gen(function* () {
											yield* pipe(
												Match.value(event),
												Match.when({type: 'auto_retry_start'}, () => setStatus('retrying')),
												Match.when({type: 'agent_start'}, () => setStatus('running')),
												Match.when({type: 'turn_end'}, turnEnd => Ref.set(finishPart, finishPartFromTurnEnd(turnEnd))),
												Match.orElse(() => Effect.void)
											)
											yield* Effect.forEach(partFromEvent(event), part => Queue.offer(queue, part), {discard: true})
											if (event.type === 'agent_end' && !event.willRetry) {
												const finish = yield* Ref.get(finishPart)
												if (Predicate.isNotUndefined(finish)) yield* Queue.offer(queue, finish)
												yield* setStatus('idle')
												yield* Ref.set(finished, true)
												yield* Queue.end(queue)
											}
										})
									)
								)
							)
						)

						yield* pipe(
							Effect.tryPromise({
								catch: cause => new AiError({cause, message: 'agent prompt failed'}),
								try: () => {
									const text = pipe(
										current.prompt.prompt,
										Array.filter(part => part.type === 'text'),
										Array.map(part => part.text),
										Array.join('\n\n')
									)
									const images = Array.filter(current.prompt.prompt, part => part.type === 'image')
									return current.session.prompt(text, {images})
								}
							}),
							Effect.catch(error =>
								pipe(
									Ref.set(finished, true),
									Effect.andThen(setStatus('error')),
									Effect.andThen(Queue.offer(queue, Response.makePart('error', {error: error.message}))),
									Effect.andThen(Queue.end(queue))
								)
							)
						)
					}),
					Semaphore.withPermit(promptLock),
					Effect.withSpan('Agent.prompt')
				)
			),
		status
	}
})
