import type {Context} from 'effect'
import {
	Array,
	DateTime,
	Effect,
	Encoding,
	Match,
	Predicate,
	Queue,
	Record,
	Ref,
	Schema,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import type {ImageContent, TextContent} from '@earendil-works/pi-ai'
import {OPENAI_CODEX_MODELS} from '@earendil-works/pi-ai/providers/openai-codex.models'
import {
	DefaultResourceLoader,
	SessionManager,
	createAgentSession,
	getAgentDir,
	type AgentToolResult,
	type AgentSessionEvent,
	type AgentToolUpdateCallback,
	type ExtensionContext,
	type ToolDefinition
} from '@earendil-works/pi-coding-agent'
import {Prompt, Response, Tool, type Toolkit} from 'effect/unstable/ai'

import {AiError, type AiStatus} from '../schema.ts'
import {Ai} from '../service.ts'

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

function agentToolResult(result: unknown) {
	return {content: [{text: textFromResult(result), type: 'text'}], details: result} satisfies AgentToolResult<unknown>
}

function partFromEvent<ToolSet extends Ai.Tools>(event: AgentSessionEvent) {
	return pipe(
		Match.value(event),
		Match.when({type: 'message_update'}, messageEvent =>
			pipe(
				Match.value(messageEvent.assistantMessageEvent),
				Match.when({type: 'text_delta'}, update =>
					update.delta === ''
						? Array.empty<Response.StreamPart<ToolSet>>()
						: [Response.makePart('text-delta', {delta: update.delta, id: update.partial.responseId ?? 'text'})]
				),
				Match.when({type: 'thinking_delta'}, update =>
					update.delta === ''
						? Array.empty<Response.StreamPart<ToolSet>>()
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
				Match.orElse(() => Array.empty<Response.StreamPart<ToolSet>>())
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
				: Array.empty<Response.StreamPart<ToolSet>>()
		),
		Match.when({type: 'auto_retry_start'}, retryEvent => [
			Response.makePart('error', {error: retryEvent.errorMessage})
		]),
		Match.when({type: 'compaction_end'}, compactionEvent =>
			Predicate.isNotUndefined(compactionEvent.errorMessage)
				? [Response.makePart('error', {error: compactionEvent.errorMessage})]
				: Array.empty<Response.StreamPart<ToolSet>>()
		),
		Match.orElse(() => Array.empty<Response.StreamPart<ToolSet>>())
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

function effectToolsFromToolkit<ToolSet extends Ai.Tools>(
	toolkit: Toolkit.WithHandler<ToolSet>,
	context: Context.Context<Tool.HandlerServices<ToolSet[keyof ToolSet]>>
) {
	return pipe(
		Record.keys(toolkit.tools),
		Array.map(name => {
			const tool = toolkit.tools[name]
			if (Predicate.isUndefined(tool)) throw new Error(`unknown tool ${name}`)
			const toolDefinition = {
				description: Predicate.isString(tool.description) ? tool.description : name,
				execute: async (
					_toolCallId: string,
					params: unknown,
					_signal: AbortSignal | undefined,
					onUpdate: AgentToolUpdateCallback<unknown> | undefined,
					_ctx: ExtensionContext
				) => {
					const finalResult = await Effect.runPromiseWith(context)(
						// oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Pi validates JSON arguments before execution; Effect re-validates them when the toolkit handles the call.
						toolkit.handle(name, params as Tool.Parameters<ToolSet[typeof name]>).pipe(
							Effect.flatMap(stream =>
								Stream.runFold<
									Tool.HandlerResult<ToolSet[typeof name]> | undefined,
									Tool.HandlerResult<ToolSet[typeof name]>
								>(
									() => {},
									(current, result) => {
										if (result.preliminary) {
											onUpdate?.(agentToolResult(result.encodedResult))
											return current
										}

										return result
									}
								)(stream)
							)
						)
					)

					if (Predicate.isUndefined(finalResult)) return agentToolResult(void 0)
					if (finalResult.isFailure) throw finalResult.encodedResult
					return agentToolResult(finalResult.encodedResult)
				},
				label: name,
				name,
				parameters: Tool.getJsonSchema(tool)
			} satisfies ToolDefinition
			return toolDefinition
		})
	)
}

export const makePi = Effect.fnUntraced(function* <ToolSet extends Ai.Tools>(config: Ai.Config<ToolSet>) {
	const status = yield* SubscriptionRef.make<AiStatus>({state: 'idle', updatedAt: yield* DateTime.now})
	const model = yield* SubscriptionRef.make(config.model)
	const history = yield* SubscriptionRef.make<readonly Prompt.Message[]>([config.systemPrompt])
	const promptLock = yield* Semaphore.make(1)
	const handledToolkit = yield* config.toolkit
	const toolHandlerContext = yield* Effect.context<Tool.HandlerServices<ToolSet[keyof ToolSet]>>()
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

	const result = yield* Effect.tryPromise({
		catch: cause => new AiError({cause, message: 'failed to create pi agent session'}),
		try: () =>
			createAgentSession({
				customTools: effectToolsFromToolkit(handledToolkit, toolHandlerContext),
				cwd: config.cwd,
				model: OPENAI_CODEX_MODELS[config.model.id],
				noTools: 'all',
				resourceLoader,
				sessionManager: SessionManager.inMemory(config.cwd),
				thinkingLevel: config.model.reasoning,
				tools: Record.keys(handledToolkit.tools)
			})
	})

	yield* Effect.addFinalizer(() =>
		Effect.sync(() => {
			result.session.dispose()
		})
	)

	const setStatus = Effect.fnUntraced(function* (state: AiStatus['state']) {
		yield* SubscriptionRef.set(status, {state, updatedAt: yield* DateTime.now})
	})
	const reconcileModel = Effect.fnUntraced(function* () {
		const current = yield* SubscriptionRef.get(model)
		yield* Effect.tryPromise({
			catch: cause => new AiError({cause, message: `failed to set pi model ${current.provider}/${current.id}`}),
			try: () => result.session.setModel(OPENAI_CODEX_MODELS[current.id])
		})
		yield* Effect.sync(() => {
			result.session.setThinkingLevel(current.reasoning)
		})
	})
	const appendAssistantHistory = Effect.fnUntraced(function* (text: string, reasoning: string) {
		if (String.isEmpty(text) && String.isEmpty(reasoning)) return

		const content = [
			...(String.isEmpty(reasoning) ? [] : [Prompt.makePart('reasoning', {text: reasoning})]),
			...(String.isEmpty(text) ? [] : [Prompt.makePart('text', {text})])
		]
		yield* SubscriptionRef.update(history, messages => [...messages, Prompt.makeMessage('assistant', {content})])
	})
	const deliver = Effect.fnUntraced(function* (message: Prompt.UserMessage, delivery: 'prompt' | 'steer' | 'queue') {
		yield* reconcileModel()
		const content = yield* piContentFromPromptParts(message.content)
		if (delivery === 'prompt') {
			yield* Effect.tryPromise({
				catch: cause => new AiError({cause, message: 'agent prompt failed'}),
				try: () => result.session.sendUserMessage(content)
			})
			return
		}

		if (!result.session.isStreaming) {
			return yield* new AiError({message: `cannot ${delivery} when the agent is idle`})
		}

		yield* Effect.tryPromise({
			catch: cause => new AiError({cause, message: `agent ${delivery} failed`}),
			try: () => result.session.sendUserMessage(content, {deliverAs: delivery === 'steer' ? 'steer' : 'followUp'})
		})
	})

	yield* pipe(
		SubscriptionRef.changes(model),
		Stream.runForEach(() =>
			pipe(
				reconcileModel(),
				Effect.catch(error => pipe(setStatus('error'), Effect.andThen(Effect.logError(error.message))))
			)
		),
		Effect.forkScoped
	)

	return Ai.of({
		history,
		model,
		prompt: (message: Prompt.UserMessage) =>
			Stream.callback<Response.StreamPart<ToolSet>, AiError>(queue =>
				pipe(
					Effect.gen(function* () {
						if (result.session.isStreaming) {
							yield* Queue.offer(queue, Response.makePart('error', {error: 'agent is already running'}))
							yield* Queue.end(queue)
							return
						}

						const currentModel = yield* SubscriptionRef.get(model)
						yield* Effect.annotateCurrentSpan({
							cwd: config.cwd,
							model: currentModel.id,
							provider: currentModel.provider,
							reasoning: currentModel.reasoning
						})

						const events = yield* Queue.bounded<AgentSessionEvent>(1_024)
						const finished = yield* Ref.make(false)
						const finishPart = yield* Ref.make<Response.StreamPart<ToolSet> | undefined>(void 0)
						const overflowed = yield* Ref.make(false)
						const assistantText = yield* Ref.make('')
						const assistantReasoning = yield* Ref.make('')
						yield* SubscriptionRef.update(history, messages => [...messages, message])
						yield* setStatus('running')
						const unsubscribe = result.session.subscribe(event => {
							if (Queue.offerUnsafe(events, event)) return

							void result.session.abort()
							Effect.runForkWith(toolHandlerContext)(
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
										try: () => result.session.abort()
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
												Match.when({type: 'message_update'}, messageEvent =>
													pipe(
														Match.value(messageEvent.assistantMessageEvent),
														Match.when({type: 'text_delta'}, update =>
															Ref.update(assistantText, current => `${current}${update.delta}`)
														),
														Match.when({type: 'thinking_delta'}, update =>
															Ref.update(assistantReasoning, current => `${current}${update.delta}`)
														),
														Match.orElse(() => Effect.void)
													)
												),
												Match.when({type: 'turn_end'}, turnEnd => Ref.set(finishPart, finishPartFromTurnEnd(turnEnd))),
												Match.orElse(() => Effect.void)
											)
											yield* Effect.forEach(partFromEvent<ToolSet>(event), part => Queue.offer(queue, part), {
												discard: true
											})
											if (event.type === 'agent_end' && !event.willRetry) {
												const finish = yield* Ref.get(finishPart)
												if (Predicate.isNotUndefined(finish)) yield* Queue.offer(queue, finish)
												yield* appendAssistantHistory(yield* Ref.get(assistantText), yield* Ref.get(assistantReasoning))
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
							deliver(message, 'prompt'),
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
					Effect.withSpan('Ai.prompt')
				)
			),
		queue: (message: Prompt.UserMessage) =>
			pipe(
				deliver(message, 'queue'),
				Effect.andThen(SubscriptionRef.update(history, messages => [...messages, message])),
				Effect.withSpan('Ai.queue')
			),
		status,
		steer: (message: Prompt.UserMessage) =>
			pipe(
				deliver(message, 'steer'),
				Effect.andThen(SubscriptionRef.update(history, messages => [...messages, message])),
				Effect.withSpan('Ai.steer')
			)
	})
})
