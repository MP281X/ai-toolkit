import {Config, Effect, Record, Schema} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'

export const ProviderId = Schema.Literal('opencode_zen')
export type ProviderId = typeof ProviderId.Type

export const ModelId = Schema.Literal('glm-4.7-free', 'kimi-k2.5-free', 'minimax-m2.1-free')
export type ModelId = typeof ModelId.Type

export const ModelKeySchema = Schema.TemplateLiteral(ProviderId, Schema.Literal(':'), ModelId)
export type ModelKey = typeof ModelKeySchema.Type

export const ModelConfig = Schema.Struct({
	providerId: ProviderId,
	modelId: ModelId
})
export type ModelConfig = typeof ModelConfig.Type

export class ModelResolutionError extends Schema.TaggedError<ModelResolutionError>()('ModelResolutionError', {
	providerId: Schema.String
}) {}

export const defaultModelKey = Schema.decodeUnknownSync(ModelKeySchema)('opencode_zen:glm-4.7-free')

const parseModelKey = (modelKey: ModelKey): ModelConfig => {
	const decoded = Schema.decodeUnknownSync(ModelKeySchema)(modelKey)
	const modelId = Schema.decodeUnknownSync(ModelId)(decoded.slice(decoded.indexOf(':') + 1))

	return Schema.decodeUnknownSync(ModelConfig)({
		providerId: 'opencode_zen',
		modelId
	})
}

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
