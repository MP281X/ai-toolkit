import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import {
	OpenAiClient as OpenAiCompatClient,
	OpenAiLanguageModel as OpenAiCompatLanguageModel
} from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import {Cause, Effect, Layer, Match, Option, pipe, Queue, Ref, Stream, Struct} from 'effect'

import {Chat, Prompt, Response} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {partsStreamSanitizer} from '#lib/utils.ts'
import {AgentToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'
import type {ModelId, ProviderId} from '../catalog.ts'
import {providers} from '../catalog.ts'
import {Agent} from '../service.ts'

const resolveLanguageModel = pipe(
	Match.type<{provider: ProviderId; model: ModelId}>(),
	Match.when({provider: 'openrouter'}, input =>
		Layer.provideMerge(
			OpenRouterLanguageModel.layer({
				model: input.model,
				config: {
					strictJsonSchema: true,
					parallel_tool_calls: true,
					provider: {sort: 'latency'},
					reasoning: {effort: 'minimal', summary: 'concise'}
				}
			}),
			OpenRouterClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({provider: 'opencode-go', model: 'glm-5'}, input =>
		Layer.provideMerge(
			OpenAiCompatLanguageModel.layer({
				model: input.model,
				config: {strictJsonSchema: true}
			}),
			OpenAiCompatClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({provider: 'opencode-go', model: 'deepseek-v4-flash'}, input =>
		Layer.provideMerge(
			OpenAiCompatLanguageModel.layer({model: input.model, config: {}}),
			OpenAiCompatClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({provider: 'opencode', model: 'gpt-5-nano'}, input =>
		Layer.provideMerge(
			OpenAiLanguageModel.layer({
				model: input.model,
				config: {text: {verbosity: 'low'}}
			}),
			OpenAiClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({provider: 'openai'}, input =>
		Layer.provideMerge(
			OpenAiLanguageModel.layer({model: input.model, config: {text: {verbosity: 'low'}}}),
			OpenAiClient.layerConfig(providers[input.provider])
		)
	),
	Match.orElseAbsurd
)

export const makeLayerEffect = pipe(
	Effect.gen(function* () {
		const services = yield* Effect.context<
			Layer.Success<typeof WebSearchToolKitLayer> | Layer.Success<typeof WebFetchToolKitLayer> | HttpClient.HttpClient
		>()
		const chat = yield* Chat.empty

		return Agent.of({
			history: pipe(Ref.get(chat.history), Effect.map(Struct.get('content'))),
			streamText: input =>
				Stream.callback<Response.StreamPart<typeof AgentToolKit.tools>>(
					Effect.fnUntraced(function* (queue) {
						let prompt = Prompt.fromMessages(input.messages)

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

							return yield* Queue.end(queue)
						}
					})
				)
		})
	}),
	Effect.provide(WebSearchToolKitLayer),
	Effect.provide(WebFetchToolKitLayer)
)
