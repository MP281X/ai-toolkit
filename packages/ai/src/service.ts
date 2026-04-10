import {AnthropicClient, AnthropicLanguageModel} from '@effect/ai-anthropic'
import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import {
	// biome-ignore lint/plugin: the exports have the same names as @effect/ai-openai
	OpenAiClient as OpenAiCompatClient,
	// biome-ignore lint/plugin: the exports have the same names as @effect/ai-openai
	OpenAiLanguageModel as OpenAiCompatLanguageModel
} from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import {Context, Effect, Layer, Match, Option, pipe, Queue, Stream} from 'effect'

import type {AiError, LanguageModel, Response} from 'effect/unstable/ai'
import {Chat, Prompt} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {partsStreamSanitizer} from '#lib/utils.ts'
import {AgentToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'
import type {ModelId, ProviderId} from './catalog.ts'
import {providers} from './catalog.ts'

export class Agent extends Context.Service<Agent>()('@ai-toolkit/ai/service/Agent', {
	make: Effect.gen(function* () {
		const services = yield* Effect.context<
			| LanguageModel.LanguageModel
			| Layer.Success<typeof WebSearchToolKitLayer>
			| Layer.Success<typeof WebFetchToolKitLayer>
			| HttpClient.HttpClient
		>()

		const chat = yield* Chat.empty

		return {
			streamText: (messages: Prompt.Message[]) => {
				return Stream.callback<Response.StreamPart<typeof AgentToolKit.tools>, AiError.AiError>(
					Effect.fnUntraced(function* (queue) {
						let prompt = Prompt.fromMessages(messages)

						while (true) {
							const last = yield* pipe(
								chat.streamText({prompt, toolkit: AgentToolKit}),
								partsStreamSanitizer,
								Stream.tap(part => Queue.offer(queue, part)),
								Stream.provideContext(services),
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
			}
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
