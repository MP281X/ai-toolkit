import {Array, Cause, DateTime, Effect, pipe, Stream, SubscriptionRef} from 'effect'

import {Codex} from '@openai/codex-sdk'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import {partsStreamSanitizer, serializeAiPartToMarkdown} from '#lib/utils.ts'
import type {AgentToolKit} from '#tools/contracts.ts'
import {Agent} from '../service.ts'

type StreamPart = Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>

export const makeLayerCodex = Effect.fnUntraced(function* (config: {
	readonly sessionId?: string
	readonly systemPrompt: Prompt.SystemMessage
}) {
	const codex = new Codex()
	const thread = config.sessionId ? codex.resumeThread(config.sessionId) : codex.startThread()
	const status = yield* SubscriptionRef.make<{
		readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
		readonly updatedAt: DateTime.Utc
	}>({state: 'idle', updatedAt: yield* DateTime.now})
	let firstTurn = true

	return Agent.of({
		status,
		streamText: input =>
			Stream.unwrap(
				pipe(
					pipe(
						DateTime.now,
						Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'running', updatedAt} as const))
					),
					Effect.as(
						pipe(
							Effect.sync(() => {
								const messages = serializeAiPartToMarkdown(input.messages).markdown
								const prompt = firstTurn ? `${config.systemPrompt.content}\n\n${messages}` : messages
								firstTurn = false

								return prompt
							}),
							Effect.flatMap(prompt => Effect.promise(() => thread.runStreamed(prompt))),
							Stream.fromEffect,
							Stream.flatMap(result => Stream.fromAsyncIterable(result.events, Cause.die)),
							Stream.flatMap(event => {
								const parts = Array.empty<StreamPart>()
								if (event.type === 'item.completed') {
									if (event.item.type === 'agent_message' && event.item.text) {
										parts.push(Response.makePart('text-delta', {delta: event.item.text, id: event.item.id}))
									}
									if (event.item.type === 'reasoning' && event.item.text) {
										parts.push(Response.makePart('reasoning-delta', {delta: event.item.text, id: event.item.id}))
									}
									if (event.item.type === 'command_execution' && event.item.status !== 'in_progress') {
										parts.push(
											Response.makePart('tool-result', {
												encodedResult: event.item.aggregated_output,
												id: event.item.id,
												isFailure: event.item.status === 'failed',
												name: 'command_execution',
												preliminary: false,
												providerExecuted: false,
												result: event.item.aggregated_output
											})
										)
									}
									if (event.item.type === 'mcp_tool_call' && event.item.status !== 'in_progress') {
										parts.push(
											Response.makePart('tool-result', {
												encodedResult: event.item.status === 'failed' ? event.item.error?.message : event.item.result,
												id: event.item.id,
												isFailure: event.item.status === 'failed',
												name: event.item.tool,
												preliminary: false,
												providerExecuted: false,
												result: event.item.status === 'failed' ? event.item.error?.message : event.item.result
											})
										)
									}
									if (event.item.type === 'error') {
										parts.push(Response.makePart('error', {error: event.item.message}))
									}
									return Stream.fromIterable(parts)
								}
								if (event.type === 'turn.completed') {
									parts.push(
										Response.makePart('finish', {
											metadata: {},
											reason: 'stop',
											response: undefined,
											usage: {
												inputTokens: {
													cacheRead: event.usage.cached_input_tokens,
													cacheWrite: 0,
													uncached: event.usage.input_tokens - event.usage.cached_input_tokens,
													total: event.usage.input_tokens
												},
												outputTokens: {
													reasoning: event.usage.reasoning_output_tokens,
													text: event.usage.output_tokens - event.usage.reasoning_output_tokens,
													total: event.usage.output_tokens
												}
											}
										})
									)
								}
								if (event.type === 'turn.failed') {
									parts.push(Response.makePart('error', {error: event.error.message}))
								}
								if (event.type === 'error') parts.push(Response.makePart('error', {error: event.message}))
								return Stream.fromIterable(parts)
							}),
							partsStreamSanitizer,
							Stream.ensuring(
								pipe(
									DateTime.now,
									Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'idle', updatedAt} as const))
								)
							),
							Stream.catchCause(cause =>
								Stream.fromEffect(
									pipe(
										pipe(
											DateTime.now,
											Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'error', updatedAt} as const))
										),
										Effect.as(Response.makePart('error', {error: Cause.pretty(cause)}))
									)
								)
							)
						)
					)
				)
			)
	})
})
