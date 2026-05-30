import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import * as OpenAiCompat from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'

import {Layer, Match, pipe} from 'effect'

import type {ModelId, ProviderId} from '../catalog.ts'
import {providers} from '../catalog.ts'

export const resolveLanguageModel = pipe(
	Match.type<{readonly provider: ProviderId; readonly model: ModelId}>(),
	Match.when({provider: 'openrouter'}, input =>
		Layer.provideMerge(
			OpenRouterLanguageModel.layer({
				config: {
					parallel_tool_calls: true,
					provider: {sort: 'latency'},
					reasoning: {effort: 'minimal', summary: 'concise'},
					strictJsonSchema: true
				},
				model: input.model
			}),
			OpenRouterClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({model: 'glm-5', provider: 'opencode-go'}, input =>
		Layer.provideMerge(
			OpenAiCompat.OpenAiLanguageModel.layer({config: {strictJsonSchema: true}, model: input.model}),
			OpenAiCompat.OpenAiClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({model: 'deepseek-v4-flash', provider: 'opencode-go'}, input =>
		Layer.provideMerge(
			OpenAiCompat.OpenAiLanguageModel.layer({config: {}, model: input.model}),
			OpenAiCompat.OpenAiClient.layerConfig(providers[input.provider])
		)
	),
	Match.when({provider: 'openai'}, input =>
		Layer.provideMerge(
			OpenAiLanguageModel.layer({config: {text: {verbosity: 'low'}}, model: input.model}),
			OpenAiClient.layerConfig(providers[input.provider])
		)
	),
	Match.orElseAbsurd
)
