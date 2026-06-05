import {DateTime, Effect, Queue, Ref, Stream, SubscriptionRef, pipe} from 'effect'

import {getModel} from '@earendil-works/pi-ai'
import type {AgentSessionEvent} from '@earendil-works/pi-coding-agent'
import {DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir} from '@earendil-works/pi-coding-agent'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import {serializePromptMessagesToMarkdown} from '../lib/utils.ts'
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
	const sessionRef = yield* Ref.make<Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined>(void 0)
	const sessionManager = SessionManager.inMemory(config.cwd)

	const setStatus = Effect.fnUntraced(function* (state: AgentStatus['state']) {
		yield* SubscriptionRef.set(status, {state, updatedAt: yield* DateTime.now})
	})

	const session = Effect.fnUntraced(function* (input: AgentPrompt) {
		const model = getModel(input.provider, input.model)
		const current = yield* Ref.get(sessionRef)
		if (current !== undefined) {
			yield* Effect.tryPromise({
				catch: cause => new AiErrorSchema({cause, message: 'failed to update pi agent model'}),
				try: () => current.setModel(model)
			})
			current.setThinkingLevel(input.thinkingLevel ?? 'low')
			return current
		}

		const noTools = config.tools === 'none' ? 'all' : undefined
		const tools =
			config.tools === undefined || config.tools === 'all' || config.tools === 'none' ? undefined : [...config.tools]
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

		yield* Ref.set(sessionRef, result.session)
		yield* Effect.addFinalizer(() => Effect.sync(() => result.session.dispose()))
		return result.session
	})

	return {
		history: Ref.get(history),
		status,
		streamText: (input: AgentPrompt) =>
			Stream.callback<AgentPart, AiError>(queue =>
				Effect.gen(function* () {
					const current = yield* session(input)
					const finished = yield* Ref.make(false)
					const finishPart = yield* Ref.make<AgentPart | undefined>(void 0)
					yield* Ref.set(history, input.messages)
					yield* setStatus('running')
					const unsubscribe = current.subscribe(event => {
						Effect.runFork(
							Effect.gen(function* () {
								if (event.type === 'auto_retry_start') yield* setStatus('retrying')
								if (event.type === 'agent_start') yield* setStatus('running')
								if (event.type === 'turn_end') yield* Ref.set(finishPart, finishPartFromTurnEnd(event))
								const part = partFromEvent(event)
								if (part !== undefined) yield* Queue.offer(queue, part)
								if (event.type === 'agent_end') {
									const finish = yield* Ref.get(finishPart)
									if (finish !== undefined) yield* Queue.offer(queue, finish)
									yield* setStatus('idle')
									yield* Ref.set(finished, true)
									unsubscribe()
									yield* Queue.end(queue)
								}
							})
						)
					})
					yield* Effect.addFinalizer(() =>
						pipe(
							Effect.gen(function* () {
								const completed = yield* Ref.get(finished)
								yield* Effect.sync(unsubscribe)
								if (completed) return

								yield* setStatus('stopping')
								yield* Effect.tryPromise({
									catch: cause => new AiErrorSchema({cause, message: 'failed to abort agent'}),
									try: () => current.abort()
								})
								yield* setStatus('idle')
							}),
							Effect.catch(() => setStatus('idle'))
						)
					)

					yield* pipe(
						Effect.tryPromise({
							catch: cause => new AiErrorSchema({cause, message: 'agent prompt failed'}),
							try: () => current.prompt(serializePromptMessagesToMarkdown(input.messages))
						}),
						Effect.catch(error =>
							pipe(
								Ref.set(finished, true),
								Effect.andThen(setStatus('error')),
								Effect.andThen(Queue.offer(queue, Response.makePart('error', {error: error.message}))),
								Effect.andThen(Queue.end(queue)),
								Effect.ensuring(Effect.sync(unsubscribe))
							)
						)
					)
				})
			)
	}
})
