import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import {Effect, FiberHandle, Layer, Match, PubSub, pipe, Ref, ServiceMap, Stream} from 'effect'

import type {Response} from 'effect/unstable/ai'
import {Chat, Prompt} from 'effect/unstable/ai'

import type {ModelId, ProviderId} from './catalog.ts'
import {providers} from './catalog.ts'
import {partsStreamSanitizer, ToolKit} from './schema.ts'
import {ToolKitLayer} from './tools.ts'

export const makeResumableStream = Effect.gen(function* () {
	type Part = Prompt.UserMessage | Response.StreamPart<typeof ToolKit.tools>

	const history = yield* Ref.make<Part[]>([])
	const pubsub = yield* PubSub.unbounded<Part>()

	const ingest = Effect.fnUntraced(function* (part: Part) {
		yield* Ref.update(history, arr => [...arr, part])
		yield* PubSub.publish(pubsub, part)
	})

	const subscribe = Stream.concat(Stream.fromIterableEffect(Ref.get(history)), Stream.fromPubSub(pubsub))

	return {ingest, subscribe}
})

export class Agent extends ServiceMap.Service<Agent>()('@ai-toolkit/ai/service/Agent', {
	make: Effect.gen(function* () {
		const chat = yield* Chat.empty
		const resumableStream = yield* makeResumableStream
		const handle = yield* FiberHandle.make()

		return {
			prompt: Effect.fnUntraced(function* (message: Prompt.UserMessage) {
				yield* FiberHandle.run(
					handle,
					pipe(
						resumableStream.ingest(message),
						Effect.andThen(
							pipe(
								chat.streamText({prompt: Prompt.fromMessages([message]), toolkit: ToolKit}),
								partsStreamSanitizer,
								Stream.tap(resumableStream.ingest),
								Stream.runDrain
							)
						)
					)
				)
			}),
			stop: FiberHandle.clear(handle),
			events: resumableStream.subscribe
		}
	})
}) {
	static layer = Layer.provideMerge(Layer.effect(this, this.make), ToolKitLayer)

	static resolveLanguageModel = pipe(
		Match.type<{provider: ProviderId; model: ModelId}>(),
		Match.when({provider: 'openrouter'}, ({model, provider}) =>
			Layer.provide(OpenRouterLanguageModel.layer({model}), OpenRouterClient.layerConfig(providers[provider]))
		),
		Match.when({model: 'gpt-5-nano'}, ({model, provider}) =>
			Layer.provide(OpenAiLanguageModel.layer({model}), OpenAiClient.layerConfig(providers[provider]))
		),
		Match.orElseAbsurd
	)
}
