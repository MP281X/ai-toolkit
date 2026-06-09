import {DateTime, Effect, Encoding, Predicate, Queue, Ref, Semaphore, Stream, SubscriptionRef, pipe} from 'effect'

import {getModel} from '@earendil-works/pi-ai'
import type {AssistantMessage, ImageContent, Message, TextContent, ToolResultMessage} from '@earendil-works/pi-ai'
import type {AgentSessionEvent} from '@earendil-works/pi-coding-agent'
import {DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir} from '@earendil-works/pi-coding-agent'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import type {AiError, AgentStatus} from '../schema.ts'
import {AiError as AiErrorSchema} from '../schema.ts'
import type {AgentLayerConfig, AgentPrompt} from '../service.ts'

const emptyUsage = new Response.Usage({
	inputTokens: {cacheRead: undefined, cacheWrite: undefined, total: undefined, uncached: undefined},
	outputTokens: {reasoning: undefined, text: undefined, total: undefined}
})

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

type AgentPart = Response.StreamPart<Toolkit.Any['tools']>

function imageDataFromFilePart(part: Prompt.FilePart) {
	if (part.data instanceof URL) return
	if (typeof part.data !== 'string') return Encoding.encodeBase64(part.data)

	const dataUrlPrefix = `data:${part.mediaType};base64,`
	return part.data.startsWith(dataUrlPrefix) ? part.data.slice(dataUrlPrefix.length) : part.data
}

function imageFromFilePart(part: Prompt.FilePart): ImageContent | undefined {
	if (!part.mediaType.startsWith('image/')) return undefined
	const data = imageDataFromFilePart(part)
	if (data === undefined) return undefined
	return {data, mimeType: part.mediaType, type: 'image'}
}

function textFromResult(result: unknown) {
	if (Predicate.isString(result)) return result
	if (Predicate.isUndefined(result)) return 'undefined'
	return JSON.stringify(result, undefined, 2)
}

function toolArgumentsFromParams(params: unknown): Record<string, unknown> | undefined {
	if (!Predicate.isObject(params)) return
	return Object.fromEntries(Object.entries(params))
}

const piContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.Part[]) {
	const content: (TextContent | ImageContent)[] = []
	for (const part of parts) {
		if (part.type === 'text') content.push({text: part.text, type: 'text'})
		if (part.type === 'file') {
			const image = imageFromFilePart(part)
			if (image === undefined) {
				return yield* new AiErrorSchema({
					message:
						part.data instanceof URL
							? 'Pi agent does not support URL file prompt parts'
							: `Pi agent does not support ${part.mediaType} file prompt parts`
				})
			}
			content.push(image)
		}
	}
	return content
})

const piAssistantContentFromPromptParts = Effect.fnUntraced(function* (parts: readonly Prompt.AssistantMessagePart[]) {
	const content: AssistantMessage['content'] = []
	for (const part of parts) {
		if (part.type === 'text') content.push({text: part.text, type: 'text'})
		if (part.type === 'reasoning') content.push({thinking: part.text, type: 'thinking'})
		if (part.type === 'tool-call') {
			const args = toolArgumentsFromParams(part.params)
			if (args === undefined) {
				return yield* new AiErrorSchema({
					message: `Pi agent cannot restore non-object tool call params for ${part.name}`
				})
			}
			content.push({arguments: args, id: part.id, name: part.name, type: 'toolCall'})
		}
		if (part.type === 'file') return
		if (part.type === 'tool-approval-request') return
	}
	return content
})

const piToolResultsFromPromptParts = Effect.fnUntraced(function* (
	parts: readonly (Prompt.ToolResultPart | Prompt.ToolApprovalResponsePart)[]
) {
	const messages: ToolResultMessage[] = []
	for (const part of parts) {
		if (part.type === 'tool-approval-response') {
			return yield* new AiErrorSchema({message: 'Pi agent does not support tool approval response prompt parts'})
		}
		messages.push({
			content: [{text: textFromResult(part.result), type: 'text'}],
			isError: part.isFailure,
			role: 'toolResult',
			timestamp: Date.now(),
			toolCallId: part.id,
			toolName: part.name
		})
	}
	return messages
})

const piMessagesFromPromptHistory = Effect.fnUntraced(function* (
	messages: readonly Prompt.Message[],
	input: AgentPrompt,
	currentUserMessage: Prompt.UserMessage
) {
	const history: Message[] = []
	for (const message of messages.slice(0, -1)) {
		if (message.role === 'system') continue
		if (message.role === 'user') {
			history.push({content: yield* piContentFromPromptParts(message.content), role: 'user', timestamp: Date.now()})
		}
		if (message.role === 'assistant') {
			const content = yield* piAssistantContentFromPromptParts(message.content)
			if (content === undefined) {
				return yield* new AiErrorSchema({message: 'Pi agent does not support assistant file or approval prompt parts'})
			}
			const hasToolCalls = content.some(part => part.type === 'toolCall')
			history.push({
				api: 'openai-codex-responses',
				content,
				model: input.model,
				provider: input.provider,
				role: 'assistant',
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
			})
			const toolResults = yield* piToolResultsFromPromptParts(
				message.content.filter(part => part.type === 'tool-result')
			)
			history.push(...toolResults)
		}
		if (message.role === 'tool') {
			history.push(...(yield* piToolResultsFromPromptParts(message.content)))
		}
	}

	return {history, prompt: yield* piContentFromPromptParts(currentUserMessage.content)}
})

function partFromEvent(event: AgentSessionEvent): AgentPart | undefined {
	if (event.type === 'message_update') {
		const update = event.assistantMessageEvent
		if (update.type === 'text_delta' && update.delta !== '') {
			return Response.makePart('text-delta', {delta: update.delta, id: update.partial.responseId ?? 'text'})
		}
		if (update.type === 'thinking_delta' && update.delta !== '') {
			return Response.makePart('reasoning-delta', {delta: update.delta, id: update.partial.responseId ?? 'reasoning'})
		}
		if (update.type === 'toolcall_end') {
			return Response.makePart('tool-call', {
				id: update.toolCall.id,
				name: update.toolCall.name,
				params: update.toolCall.arguments,
				providerExecuted: false
			})
		}
		return undefined
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

	return undefined
}

function finishPartFromTurnEnd(event: Extract<AgentSessionEvent, {type: 'turn_end'}>) {
	const message = event.message
	return Response.makePart('finish', {
		reason: message.role === 'assistant' ? finishReason(message.stopReason) : 'stop',
		response: undefined,
		usage: message.role === 'assistant' ? usageFromAssistant(message) : emptyUsage
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
		let tools: string[] | undefined
		if (config.tools === 'all') {
			tools = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']
		} else if (config.tools !== undefined && config.tools !== 'none') {
			tools = [...config.tools]
		}
		const resourceLoader = new DefaultResourceLoader({
			agentDir: getAgentDir(),
			appendSystemPromptOverride: () => [],
			cwd: config.cwd,
			systemPromptOverride: () => config.systemPrompt.content
		})
		yield* Effect.tryPromise({
			catch: cause => new AiErrorSchema({cause, message: 'failed to load pi agent resources'}),
			try: () => resourceLoader.reload()
		})
		const currentUserMessage = input.messages.findLast(message => message.role === 'user')
		if (currentUserMessage === undefined || input.messages.at(-1) !== currentUserMessage) {
			return yield* new AiErrorSchema({message: 'Pi agent prompts must end with a user message'})
		}
		const prompt = yield* piMessagesFromPromptHistory(input.messages, input, currentUserMessage)
		const sessionManager = SessionManager.inMemory(config.cwd)
		for (const message of prompt.history) {
			sessionManager.appendMessage(message)
		}
		const result = yield* Effect.tryPromise({
			catch: cause => new AiErrorSchema({cause, message: 'failed to create pi agent session'}),
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

		yield* Effect.addFinalizer(() => Effect.sync(() => result.session.dispose()))
		return {prompt, session: result.session}
	})

	return {
		history: Ref.get(history),
		status,
		streamText: (input: AgentPrompt) =>
			Stream.callback<AgentPart, AiError>(queue =>
				pipe(
					Effect.gen(function* () {
						const current = yield* session(input)
						const events = yield* Queue.unbounded<AgentSessionEvent>()
						const finished = yield* Ref.make(false)
						const finishPart = yield* Ref.make<AgentPart | undefined>(void 0)
						yield* Ref.set(history, input.messages)
						yield* setStatus('running')
						const unsubscribe = current.session.subscribe(event => {
							Queue.offerUnsafe(events, event)
						})
						yield* Effect.addFinalizer(() =>
							pipe(
								Effect.gen(function* () {
									yield* Effect.sync(unsubscribe)
									const completed = yield* Ref.get(finished)
									if (completed) return

									yield* setStatus('stopping')
									yield* Effect.tryPromise({
										catch: cause => new AiErrorSchema({cause, message: 'failed to abort agent'}),
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
						)

						yield* pipe(
							Effect.tryPromise({
								catch: cause => new AiErrorSchema({cause, message: 'agent prompt failed'}),
								try: () => {
									const text = current.prompt.prompt
										.filter((part): part is TextContent => part.type === 'text')
										.map(part => part.text)
										.join('\n\n')
									const images = current.prompt.prompt.filter((part): part is ImageContent => part.type === 'image')
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
					Semaphore.withPermit(promptLock)
				)
			)
	}
})
