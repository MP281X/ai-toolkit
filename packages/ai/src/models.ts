import {Config, Effect, Record, Schema} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'

export type ProviderId = 'opencode_zen'
export const ProviderId = Schema.Literal('opencode_zen')

export type ModelId = 'glm-4.7-free' | 'kimi-k2.5-free' | 'minimax-m2.1-free'
export const ModelId = Schema.Literal('glm-4.7-free', 'kimi-k2.5-free', 'minimax-m2.1-free')

export class ModelConfig extends Schema.Class<ModelConfig>('ModelConfig')({
	providerId: ProviderId,
	modelId: ModelId
}) {}
export type ModelConfigType = typeof ModelConfig.Type

export const ModelKeySchema = Schema.TemplateLiteral(ProviderId, Schema.Literal(':'), ModelId)
export type ModelKeySchema = typeof ModelKeySchema.Type

export class ModelResolutionError extends Schema.TaggedError<ModelResolutionError>()('ModelResolutionError', {
	providerId: Schema.String
}) {}

export const ModelKey = Schema.transform(ModelKeySchema, ModelConfig, {
	decode: modelKey =>
		ModelConfig.make({
			providerId: 'opencode_zen',
			modelId: modelKey.split(':')[1] as ModelId
		}),
	encode: config => `opencode_zen:${config.modelId}` as ModelKey
})
export type ModelKey = `${ProviderId}:${ModelId}`

export const parseModelKey = (modelKey: ModelKey): ModelConfigType => Schema.decodeUnknownSync(ModelKey)(modelKey)

const buildProviders = Effect.gen(function* () {
	const opencodeZen = createOpenAICompatible({
		name: 'opencode_zen',
		baseURL: 'https://opencode.ai/zen/v1',
		apiKey: yield* Config.string('AI_OPENCODE_ZEN')
	})

	return Record.fromEntries([['opencode_zen', opencodeZen]])
})

export const resolveLanguageModel = Effect.fnUntraced(function* (modelKey: ModelKey) {
	const providers = yield* buildProviders
	const config = parseModelKey(modelKey)
	const provider = providers[config.providerId]

	if (!provider) {
		return yield* new ModelResolutionError({providerId: config.providerId})
	}

	return provider(config.modelId)
})
