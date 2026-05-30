import type {Layer} from 'effect'
import {Cause, DateTime, Effect, Option, Queue, Ref, Stream, SubscriptionRef, flow, pipe} from 'effect'

import {Chat, Prompt, Response, Toolkit} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {Agent} from '../service.ts'

import {resolveLanguageModel} from '#lib/language-model.ts'
import {partsStreamSanitizer} from '#lib/utils.ts'
import {WebFetchToolKit, WebSearchToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'

export const makeLayerEffect = Effect.fnUntraced(
	function* (config: {readonly cwd: string; readonly systemPrompt: Prompt.SystemMessage}) {
		const services = yield* Effect.context<
			Layer.Success<typeof WebSearchToolKitLayer> | Layer.Success<typeof WebFetchToolKitLayer> | HttpClient.HttpClient
		>()
		const chat = yield* Chat.empty
		const toolkit = Toolkit.merge(WebSearchToolKit, WebFetchToolKit)
		const status = yield* SubscriptionRef.make<{
			readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
			readonly updatedAt: DateTime.Utc
		}>({state: 'idle', updatedAt: yield* DateTime.now})

		return Agent.of({
			history: Effect.map(Ref.get(chat.history), history => history.content),
			status,
			streamText: input =>
				Stream.callback(
					Effect.fnUntraced(function* (queue) {
						yield* pipe(
							DateTime.now,
							Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'running', updatedAt} as const))
						)
						let prompt = Prompt.prependSystem(Prompt.fromMessages(input.messages), config.systemPrompt.content)

						while (true) {
							const last = yield* pipe(
								chat.streamText({prompt, toolkit}),
								partsStreamSanitizer,
								Stream.tap(part => Queue.offer(queue, part)),
								Stream.provide(resolveLanguageModel({model: input.model, provider: input.provider})),
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
	},
	flow(Effect.provide(WebSearchToolKitLayer), Effect.provide(WebFetchToolKitLayer))
)
