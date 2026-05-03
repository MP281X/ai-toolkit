import {Array, Cause, DateTime, Effect, pipe, Stream, SubscriptionRef} from 'effect'

import {createOpencode} from '@opencode-ai/sdk/v2'
import type {Prompt} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import {partsStreamSanitizer, serializeAiPartToMarkdown} from '#lib/utils.ts'
import {Agent} from '../service.ts'

export const makeLayerOpencode = Effect.fnUntraced(function* (config: {
	readonly sessionId?: string
	readonly systemPrompt: Prompt.SystemMessage
}) {
	const opencode = yield* pipe(
		Effect.promise(() => createOpencode()),
		Effect.orDie
	)
	const status = yield* SubscriptionRef.make<{
		readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
		readonly updatedAt: DateTime.Utc
	}>({state: 'idle', updatedAt: yield* DateTime.now})
	const sessionId =
		config.sessionId ??
		(yield* pipe(
			Effect.promise(() => opencode.client.session.create({})),
			Effect.flatMap(result => (result.data ? Effect.succeed(result.data.id) : Effect.die(result.error))),
			Effect.orDie
		))

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
							Effect.sync(() => serializeAiPartToMarkdown(input.messages).markdown),
							Effect.flatMap(prompt =>
								Effect.promise(() =>
									opencode.client.session.prompt({
										model: {modelID: input.model, providerID: input.provider},
										parts: [{text: prompt, type: 'text'}],
										sessionID: sessionId,
										system: config.systemPrompt.content
									})
								)
							),
							Effect.map(result => result.data?.parts ?? []),
							Effect.orDie,
							Stream.fromEffect,
							Stream.flatMap(parts =>
								Stream.fromIterable(
									pipe(
										parts,
										Array.flatMap(part => {
											if (part.type === 'text' && part.text) {
												return [Response.makePart('text-delta', {delta: part.text, id: part.id})]
											}
											if (part.type === 'reasoning' && part.text) {
												return [Response.makePart('reasoning-delta', {delta: part.text, id: part.id})]
											}
											if (part.type === 'tool' && part.state.status === 'completed') {
												return [
													Response.makePart('tool-result', {
														encodedResult: part.state.output,
														id: part.callID,
														isFailure: false,
														name: part.tool,
														preliminary: false,
														providerExecuted: false,
														result: part.state.output
													})
												]
											}
											if (part.type === 'tool' && part.state.status === 'error') {
												return [
													Response.makePart('tool-result', {
														encodedResult: part.state.error,
														id: part.callID,
														isFailure: true,
														name: part.tool,
														preliminary: false,
														providerExecuted: false,
														result: part.state.error
													})
												]
											}
											return []
										})
									)
								)
							),
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
