import {Config, Effect, Schema} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'

export type ProviderId = 'opencode_zen'
export const ProviderId = Schema.Literal('opencode_zen')

export type ModelId = Schema.Schema.Type<typeof ModelId>
export const ModelId = Schema.Literal('glm-4.7-free', 'kimi-k2.5-free', 'minimax-m2.1-free')

export type Model = Schema.Schema.Type<typeof Model>
export const Model = Schema.transform(
	Schema.TemplateLiteral(ProviderId, Schema.Literal(':'), ModelId),
	Schema.Struct({provider: ProviderId, model: ModelId}),
	{
		decode: modelKey => {
			const [provider, model] = modelKey.split(':') as [ProviderId, ModelId]
			return {provider, model}
		},
		encode: config => `${config.provider}:${config.model}` as const
	}
)

const buildProviders = Effect.gen(function* () {
	return {
		opencode_zen: createOpenAICompatible({
			name: 'opencode_zen',
			baseURL: 'https://opencode.ai/zen/v1',
			apiKey: yield* Config.string('AI_OPENCODE_ZEN')
		})
	} satisfies Record<ProviderId, unknown>
})

export const resolveLanguageModel = Effect.fnUntraced(function* (model: Model) {
	const providers = yield* buildProviders
	return providers[model.provider](model.model)
})
