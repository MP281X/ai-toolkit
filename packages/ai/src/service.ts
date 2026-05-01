import {AnthropicClient, AnthropicLanguageModel} from '@effect/ai-anthropic'
import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import {
	// biome-ignore lint/plugin: the exports have the same names as @effect/ai-openai
	OpenAiClient as OpenAiCompatClient,
	// biome-ignore lint/plugin: the exports have the same names as @effect/ai-openai
	OpenAiLanguageModel as OpenAiCompatLanguageModel
} from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import type {Effect, Stream} from 'effect'
import {Context, Layer, Match, pipe} from 'effect'

import type {AiError, Prompt, Response, Toolkit} from 'effect/unstable/ai'

import type {AgentToolKit} from '#tools/contracts.ts'
import {makeLayerEffect} from './agents/effect.ts'
import type {ModelId, ProviderId} from './catalog.ts'
import {providers} from './catalog.ts'

export class Agent extends Context.Service<
	Agent,
	{
		readonly history: Effect.Effect<readonly Prompt.Message[], never, never>
		readonly streamText: (
			messages: Prompt.Message[]
		) => Stream.Stream<Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>, AiError.AiError>
	}
>()('@ai-toolkit/ai/service/Agent') {
	static layerEffect = Layer.effect(this, makeLayerEffect)

	static resolveLanguageModel = pipe(
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
		Match.when({provider: 'opencode-go', model: 'minimax-m2.5'}, input =>
			Layer.provideMerge(
				AnthropicLanguageModel.layer({
					model: input.model,
					config: {strictJsonSchema: true}
				}),
				AnthropicClient.layerConfig(providers[input.provider])
			)
		),
		Match.when({provider: 'opencode', model: 'gpt-5-nano'}, input =>
			Layer.provideMerge(
				OpenAiLanguageModel.layer({
					model: input.model,
					config: {
						strictJsonSchema: true,
						text: {verbosity: 'low'}
					}
				}),
				OpenAiClient.layerConfig(providers[input.provider])
			)
		),
		Match.orElseAbsurd
	)
}
