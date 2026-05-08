import {OpenAiClient, OpenAiLanguageModel} from '@effect/ai-openai'
import * as OpenAiCompat from '@effect/ai-openai-compat'
import {OpenRouterClient, OpenRouterLanguageModel} from '@effect/ai-openrouter'
import {Layer, Match, pipe} from 'effect'

import type {ModelId, ProviderId} from '../catalog.ts'
import {providers} from '../catalog.ts'

export const resolveLanguageModel = pipe(
	Match.type<{readonly provider: ProviderId; readonly model: ModelId}>(),
	Match.when({provider: 'openrouter'}, input => {
		return Layer.provideMerge(
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
	}),
	Match.when({provider: 'opencode-go', model: 'glm-5'}, input => {
		return Layer.provideMerge(
			OpenAiCompat.OpenAiLanguageModel.layer({
				model: input.model,
				config: {strictJsonSchema: true}
			}),
			OpenAiCompat.OpenAiClient.layerConfig(providers[input.provider])
		)
	}),
	Match.when({provider: 'opencode-go', model: 'deepseek-v4-flash'}, input => {
		return Layer.provideMerge(
			OpenAiCompat.OpenAiLanguageModel.layer({model: input.model, config: {}}),
			OpenAiCompat.OpenAiClient.layerConfig(providers[input.provider])
		)
	}),
	Match.when({provider: 'openai'}, input => {
		return Layer.provideMerge(
			OpenAiLanguageModel.layer({model: input.model, config: {text: {verbosity: 'low'}}}),
			OpenAiClient.layerConfig(providers[input.provider])
		)
	}),
	Match.orElseAbsurd
)
