import type {Layer} from 'effect'
import {Cause, DateTime, Effect, Option, pipe, Queue, Stream, SubscriptionRef} from 'effect'

import {Chat, Prompt, Response} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {resolveLanguageModel} from '#lib/language-model.ts'
import {partsStreamSanitizer} from '#lib/utils.ts'
import {AgentToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'
import {Agent} from '../service.ts'

export function makeLayerEffect(config: {readonly systemPrompt: Prompt.SystemMessage}) {
	return pipe(
		Effect.gen(function* () {
			const services = yield* Effect.context<
				Layer.Success<typeof WebSearchToolKitLayer> | Layer.Success<typeof WebFetchToolKitLayer> | HttpClient.HttpClient
			>()
			const chat = yield* Chat.empty
			const status = yield* SubscriptionRef.make<{
				readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
				readonly updatedAt: DateTime.Utc
			}>({state: 'idle', updatedAt: yield* DateTime.now})

			return Agent.of({
				status,
				streamText: input =>
					Stream.callback<Response.StreamPart<typeof AgentToolKit.tools>>(
						Effect.fnUntraced(function* (queue) {
							yield* pipe(
								DateTime.now,
								Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'running', updatedAt} as const))
							)
							let prompt = pipe(Prompt.fromMessages(input.messages), current =>
								Prompt.prependSystem(current, config.systemPrompt.content)
							)

							while (true) {
								const last = yield* pipe(
									chat.streamText({prompt, toolkit: AgentToolKit}),
									partsStreamSanitizer,
									Stream.tap(part => Queue.offer(queue, part)),
									Stream.provide(resolveLanguageModel({provider: input.provider, model: input.model})),
									Stream.provideContext(services),
									Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)}))),
									Stream.runLast
								)

								if (Option.isSome(last) && last.value.type === 'finish' && last.value.reason === 'tool-calls') {
									prompt = Prompt.empty
									continue
								}

								yield* pipe(
									DateTime.now,
									Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'idle', updatedAt} as const))
								)
								return yield* Queue.end(queue)
							}
						})
					)
			})
		}),
		Effect.provide(WebSearchToolKitLayer),
		Effect.provide(WebFetchToolKitLayer)
	)
}
