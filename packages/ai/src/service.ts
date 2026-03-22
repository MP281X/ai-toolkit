import {AnthropicClient, AnthropicLanguageModel} from '@effect/ai-anthropic'
import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import {
	OpenAiClient as OpenAiCompatClient,
	OpenAiLanguageModel as OpenAiCompatLanguageModel
} from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import {Effect, FiberHandle, Layer, Match, Option, PubSub, pipe, Ref, ServiceMap, Stream} from 'effect'

import type {LanguageModel, Response} from 'effect/unstable/ai'
import {Chat, Prompt} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {partsStreamSanitizer} from '#lib/utils.ts'
import {AgentToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'
import type {ModelId, ProviderId} from './catalog.ts'
import {providers} from './catalog.ts'

export const makeResumableStream = Effect.gen(function* () {
	type Part = Prompt.Message | Response.StreamPart<typeof AgentToolKit.tools>

	const history = yield* Ref.make<Part[]>([])
	const pubsub = yield* PubSub.unbounded<Part>()

	const append = Effect.fnUntraced(function* (part: Part) {
		yield* Ref.update(history, arr => [...arr, part])
		yield* PubSub.publish(pubsub, part)
	})

	const subscribe = Stream.concat(Stream.fromIterableEffect(Ref.get(history)), Stream.fromPubSub(pubsub))

	return {append, subscribe}
})

export class Agent extends ServiceMap.Service<Agent>()('@ai-toolkit/ai/service/Agent', {
	make: Effect.gen(function* () {
		const services = yield* Effect.services<
			| LanguageModel.LanguageModel
			| Layer.Success<typeof WebSearchToolKitLayer>
			| Layer.Success<typeof WebFetchToolKitLayer>
			| HttpClient.HttpClient
		>()

		const chat = yield* Chat.empty
		const resumableStream = yield* makeResumableStream
		const handle = yield* FiberHandle.make()

		return {
			prompt: Effect.fnUntraced(function* (messages: Prompt.Message[]) {
				yield* Effect.forEach(messages, resumableStream.append)

				yield* pipe(
					chat.streamText({prompt: Prompt.fromMessages(messages), toolkit: AgentToolKit}),
					partsStreamSanitizer,
					Stream.tap(resumableStream.append),
					Stream.runLast,
					Effect.repeat({while: Option.exists(part => part.type === 'finish' && part.reason === 'tool-calls')}),
					Effect.provide(services)
				)
			}, FiberHandle.run(handle)),
			stop: FiberHandle.clear(handle),
			events: resumableStream.subscribe
		}
	})
}) {
	static layer = pipe(
		Layer.effect(this, this.make),
		Layer.provideMerge(WebSearchToolKitLayer),
		Layer.provideMerge(WebFetchToolKitLayer)
	)

	static resolveLanguageModel = pipe(
		Match.type<{provider: ProviderId; model: ModelId}>(),
		Match.when({provider: 'openrouter'}, ({model, provider}) =>
			Layer.provide(
				OpenRouterLanguageModel.layer({
					model,
					config: {
						strictJsonSchema: true,
						parallel_tool_calls: true,
						provider: {sort: 'latency'},
						reasoning: {effort: 'minimal', summary: 'concise'}
					}
				}),
				OpenRouterClient.layerConfig(providers[provider])
			)
		),
		Match.when({provider: 'opencode_go', model: 'glm-5'}, ({model, provider}) =>
			Layer.provide(
				OpenAiCompatLanguageModel.layer({
					model,
					config: {
						strictJsonSchema: true
					}
				}),
				OpenAiCompatClient.layerConfig(providers[provider])
			)
		),
		Match.when({provider: 'opencode_go', model: 'minimax-m2.5'}, ({model, provider}) =>
			Layer.provide(
				AnthropicLanguageModel.layer({
					model,
					config: {
						strictJsonSchema: true
					}
				}),
				AnthropicClient.layerConfig(providers[provider])
			)
		),
		Match.when({provider: 'opencode_zen', model: 'gpt-5-nano'}, ({model, provider}) =>
			Layer.provide(
				OpenAiLanguageModel.layer({
					model,
					config: {
						strictJsonSchema: true,
						text: {verbosity: 'low'},
						reasoning: {effort: 'minimal'}
					}
				}),
				OpenAiClient.layerConfig(providers[provider])
			)
		),
		Match.orElseAbsurd
	)
}
