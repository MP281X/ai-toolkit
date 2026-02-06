import {Config, Effect, Record, Schema} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'

export const ProviderId = Schema.Literal('opencode_zen')
export type ProviderId = typeof ProviderId.Type

export const ModelKeySchema = Schema.TemplateLiteral(ProviderId, Schema.Literal(':'), Schema.String)
export type ModelKey = typeof ModelKeySchema.Type

export const ModelConfig = Schema.Struct({
	providerId: ProviderId,
	modelId: Schema.String
})
export type ModelConfig = typeof ModelConfig.Type

export class ModelResolutionError extends Schema.TaggedError<ModelResolutionError>()('ModelResolutionError', {
	providerId: Schema.String
}) {}

const decodeModelKey = Schema.decodeUnknownSync(ModelKeySchema)
const toModelConfig = Schema.decodeUnknownSync(ModelConfig)

export const defaultModelKey = decodeModelKey('opencode_zen:gpt-5-nano')

const parseModelKey = (modelKey: ModelKey): ModelConfig => {
	const decoded = decodeModelKey(modelKey)

	return toModelConfig({
		providerId: 'opencode_zen',
		modelId: decoded.slice(decoded.indexOf(':') + 1)
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
