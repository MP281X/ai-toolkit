import {
	Array,
	DateTime,
	Effect,
	Encoding,
	Option,
	Predicate,
	Queue,
	Ref,
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

import {AiError} from '../schema.ts'
import type {AgentLayerConfig, AgentPrompt, AgentStatus} from '../schema.ts'

function usageFromAssistant(message: {
	readonly usage: {
		readonly cacheRead: number
		readonly cacheWrite: number
		readonly input: number
		readonly output: number
		readonly totalTokens: number
	}
}) {
	return new Response.Usage({
		inputTokens: {
			cacheRead: message.usage.cacheRead,
			cacheWrite: message.usage.cacheWrite,
			total: message.usage.input,
			uncached: message.usage.input - message.usage.cacheRead
		},
		outputTokens: {reasoning: undefined, text: message.usage.output, total: message.usage.output}
	})
}

function finishReason(reason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted') {
	if (reason === 'toolUse') return 'tool-calls'
	if (reason === 'aborted') return 'error'
	return reason
}

function imageDataFromFilePart(part: Prompt.FilePart) {
	if (part.data instanceof URL) return
	if (typeof part.data !== 'string') return Encoding.encodeBase64(part.data)

	const dataUrlPrefix = `data:${part.mediaType};base64,`
	return String.startsWith(dataUrlPrefix)(part.data) ? String.slice(dataUrlPrefix.length)(part.data) : part.data
}

function imageFromFilePart(part: Prompt.FilePart) {
	if (!String.startsWith('image/')(part.mediaType)) return
	const data = imageDataFromFilePart(part)
	if (data === undefined) return
	return {data, mimeType: part.mediaType, type: 'image' as const}
}

function textFromResult(result: unknown) {
	if (Predicate.isString(result)) return result
	if (Predicate.isUndefined(result)) return 'undefined'
	return JSON.stringify(result, undefined, 2)
}

function toolArgumentsFromParams(params: unknown) {
	if (!Predicate.isObject(params)) return
	return Object.fromEntries(Object.entries(params))
}

const piContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.Part[]) {
	return yield* Effect.map(
		Effect.forEach(parts, part =>
			Effect.gen(function* () {
				if (part.type === 'text') return [{text: part.text, type: 'text' as const}]
				if (part.type === 'file') {
					const image = imageFromFilePart(part)
					if (image === undefined) {
						return yield* new AiError({
							message:
								part.data instanceof URL
									? 'Pi agent does not support URL file prompt parts'
									: `Pi agent does not support ${part.mediaType} file prompt parts`
						})
					}
					return [image]
				}
				return Array.empty<TextContent | ImageContent>()
			})
		),
		Array.flatten
	)
})

const piAssistantContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.AssistantMessagePart[]) {
	const content = yield* Effect.forEach(parts, part =>
		Effect.gen(function* () {
			if (part.type === 'text') return [{text: part.text, type: 'text' as const}]
			if (part.type === 'reasoning') return [{thinking: part.text, type: 'thinking' as const}]
			if (part.type === 'tool-call') {
				const args = toolArgumentsFromParams(part.params)
				if (args === undefined) {
					return yield* new AiError({message: `Pi agent cannot restore non-object tool call params for ${part.name}`})
				}
				return [{arguments: args, id: part.id, name: part.name, type: 'toolCall' as const}]
			}
			if (part.type === 'file') return
			if (part.type === 'tool-approval-request') return
			return Array.empty<AssistantMessage['content'][number]>()
		})
	)
	if (Array.some(content, Predicate.isUndefined)) return

	return Array.flatten(Array.filter(content, Predicate.isNotUndefined))
})

const piToolResultsFromPromptParts = Effect.fnUntraced(function* (
	parts: readonly (Prompt.ToolResultPart | Prompt.ToolApprovalResponsePart)[]
) {
	return yield* Effect.forEach(parts, part =>
		Effect.gen(function* () {
			if (part.type === 'tool-approval-response') {
				return yield* new AiError({message: 'Pi agent does not support tool approval response prompt parts'})
			}
			return {
				content: [{text: textFromResult(part.result), type: 'text' as const}],
				isError: part.isFailure,
				role: 'toolResult' as const,
				timestamp: Date.now(),
				toolCallId: part.id,
				toolName: part.name
			} satisfies ToolResultMessage
		})
	)
})

const piMessagesFromPromptHistory = Effect.fnUntraced(function* (
	messages: readonly Prompt.Message[],
	input: AgentPrompt,
	currentUserMessage: Prompt.UserMessage
) {
	const history = yield* Effect.map(
		Effect.forEach(Array.dropRight(messages, 1), message =>
			Effect.gen(function* () {
				if (message.role === 'system') return Array.empty<Message>()
				if (message.role === 'user') {
					return [
						{
							content: yield* piContentFromPromptParts(message.content),
							role: 'user' as const,
							timestamp: Date.now()
						} satisfies Message
					]
				}
				if (message.role === 'assistant') {
					const content = yield* piAssistantContentFromPromptParts(message.content)
					if (content === undefined) {
						return yield* new AiError({message: 'Pi agent does not support assistant file or approval prompt parts'})
					}
					const hasToolCalls = Array.some(content, part => part.type === 'toolCall')
					const toolResults = yield* piToolResultsFromPromptParts(
						Array.filter(message.content, part => part.type === 'tool-result')
					)
					return Array.prepend(toolResults, {
						api: 'openai-codex-responses',
						content,
						model: input.model,
						provider: input.provider,
						role: 'assistant' as const,
						stopReason: hasToolCalls ? 'toolUse' : 'stop',
						timestamp: Date.now(),
						usage: {
							cacheRead: 0,
							cacheWrite: 0,
							cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0},
							input: 0,
							output: 0,
							totalTokens: 0
						}
					} satisfies Message)
				}
				return yield* piToolResultsFromPromptParts(message.content)
			})
		),
		Array.flatten
	)

	return {history, prompt: yield* piContentFromPromptParts(currentUserMessage.content)}
})

function partFromEvent(event: AgentSessionEvent) {
	if (event.type === 'message_update') {
		if (event.assistantMessageEvent.type === 'text_delta' && event.assistantMessageEvent.delta !== '') {
			return Response.makePart('text-delta', {
				delta: event.assistantMessageEvent.delta,
				id: event.assistantMessageEvent.partial.responseId ?? 'text'
			})
		}
		if (event.assistantMessageEvent.type === 'thinking_delta' && event.assistantMessageEvent.delta !== '') {
			return Response.makePart('reasoning-delta', {
				delta: event.assistantMessageEvent.delta,
				id: event.assistantMessageEvent.partial.responseId ?? 'reasoning'
			})
		}
		if (event.assistantMessageEvent.type === 'toolcall_end') {
			return Response.makePart('tool-call', {
				id: event.assistantMessageEvent.toolCall.id,
				name: event.assistantMessageEvent.toolCall.name,
				params: event.assistantMessageEvent.toolCall.arguments,
				providerExecuted: false
			})
		}
	}

	if (event.type === 'tool_execution_end') {
		return Response.makePart('tool-result', {
			encodedResult: event.result,
			id: event.toolCallId,
			isFailure: event.isError,
			name: event.toolName,
			preliminary: false,
			providerExecuted: false,
			result: event.result
		})
	}

	if (event.type === 'message_end' && event.message.role === 'assistant') {
		return Response.makePart('response-metadata', {
			id: event.message.responseId,
			modelId: event.message.model,
			request: undefined,
			timestamp: undefined
		})
	}

	if (event.type === 'auto_retry_start') return Response.makePart('error', {error: event.errorMessage})
	if (event.type === 'compaction_end' && event.errorMessage !== undefined) {
		return Response.makePart('error', {error: event.errorMessage})
	}
}

function finishPartFromTurnEnd(event: Extract<AgentSessionEvent, {type: 'turn_end'}>) {
	return Response.makePart('finish', {
		reason: event.message.role === 'assistant' ? finishReason(event.message.stopReason) : 'stop',
		response: undefined,
		usage:
			event.message.role === 'assistant'
				? usageFromAssistant(event.message)
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
		const currentUserMessage = Array.findLast(input.messages, message => message.role === 'user')
		if (Option.isNone(currentUserMessage) || !Option.contains(Array.last(input.messages), currentUserMessage.value)) {
			return yield* new AiError({message: 'Pi agent prompts must end with a user message'})
		}
		const prompt = yield* piMessagesFromPromptHistory(input.messages, input, currentUserMessage.value)
		const sessionManager = SessionManager.inMemory(config.cwd)
		for (const message of prompt.history) {
			sessionManager.appendMessage(message)
		}
		const result = yield* Effect.tryPromise({
			catch: cause => new AiError({cause, message: 'failed to create pi agent session'}),
			try: () => {
				if (config.tools === 'all') {
					return createAgentSession({
						cwd: config.cwd,
						model,
						resourceLoader,
						sessionManager,
						thinkingLevel: input.thinkingLevel ?? 'low',
						tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']
					})
				}

				if (config.tools === 'none') {
					return createAgentSession({
						cwd: config.cwd,
						model,
						noTools: 'all',
						resourceLoader,
						sessionManager,
						thinkingLevel: input.thinkingLevel ?? 'low'
					})
				}

				if (config.tools === undefined) {
					return createAgentSession({
						cwd: config.cwd,
						model,
						resourceLoader,
						sessionManager,
						thinkingLevel: input.thinkingLevel ?? 'low'
					})
				}

				return createAgentSession({
					cwd: config.cwd,
					model,
					resourceLoader,
					sessionManager,
					thinkingLevel: input.thinkingLevel ?? 'low',
					tools: Array.fromIterable(config.tools)
				})
			}
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
						const events = yield* Queue.bounded<AgentSessionEvent>(1024)
						const finished = yield* Ref.make(false)
						const finishPart = yield* Ref.make<Response.StreamPart<Toolkit.Any['tools']> | undefined>(void 0)
						yield* Ref.set(history, input.messages)
						yield* setStatus('running')
						const queueState = {overflowed: false}
						const unsubscribe = current.session.subscribe(event => {
							if (Queue.offerUnsafe(events, event)) return
							if (queueState.overflowed) return

							queueState.overflowed = true
							void current.session.abort()
							Queue.offerUnsafe(queue, Response.makePart('error', {error: 'agent event queue overflow'}))
							Queue.endUnsafe(queue)
						})
						yield* Effect.addFinalizer(() =>
							Effect.orDie(
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
								})
							)
						)
						yield* Effect.forkScoped(
							Effect.forever(
								Effect.flatMap(Queue.take(events), event =>
									Effect.gen(function* () {
										if (event.type === 'auto_retry_start') yield* setStatus('retrying')
										if (event.type === 'agent_start') yield* setStatus('running')
										if (event.type === 'turn_end') yield* Ref.set(finishPart, finishPartFromTurnEnd(event))
										const part = partFromEvent(event)
										if (part !== undefined) yield* Queue.offer(queue, part)
										if (event.type === 'agent_end' && !event.willRetry) {
											const finish = yield* Ref.get(finishPart)
											if (finish !== undefined) yield* Queue.offer(queue, finish)
											yield* setStatus('idle')
											yield* Ref.set(finished, true)
											yield* Queue.end(queue)
										}
									})
								)
							)
						)

						yield* Effect.tryPromise({
							catch: cause => new AiError({cause, message: 'agent prompt failed'}),
							try: () => {
								const text = pipe(
									current.prompt.prompt,
									Array.filter((part): part is TextContent => part.type === 'text'),
									Array.map(part => part.text),
									Array.join('\n\n')
								)
								const images = Array.filter(
									current.prompt.prompt,
									(part): part is ImageContent => part.type === 'image'
								)
								return current.session.prompt(text, {images})
							}
						})
					}),
					Semaphore.withPermit(promptLock),
					Effect.withSpan('Agent.prompt')
				)
			),
		status
	}
})
