import {Config, Effect, Record, Schema} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'

export type ProviderId = 'opencode_zen'

export type ModelKey = `${ProviderId}:${string}`

export type ModelConfig = {
	providerId: ProviderId
	modelId: string
}

export class ModelResolutionError extends Schema.TaggedError<ModelResolutionError>()('ModelResolutionError', {
	providerId: Schema.String
}) {}

export const defaultModelKey: ModelKey = 'opencode_zen:gpt-5-nano'

const parseModelKey = (modelKey: ModelKey): ModelConfig => {
	const separatorIndex = modelKey.indexOf(':')
	const modelId = modelKey.slice(separatorIndex + 1)

	return {providerId: 'opencode_zen', modelId}
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
