import {Config, Schema} from 'effect'

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literal('opencode_zen', 'openrouter')

export type AdapterId = typeof AdapterId.Type
export const AdapterId = Schema.Literal('openai', 'openai-compatible', 'anthropic', 'openrouter')

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literal(
	'gpt-5-nano',
	'big-pickle',
	'kimi-k2.5-free',
	'claude-haiku-4-5',
	'minimax-m2.5-free',
	'arcee-ai/trinity-mini:free',
	'google/gemma-3n-e4b-it:free',
	'nvidia/nemotron-3-nano-30b-a3b:free'
)

export type Model = typeof Model.Type
export const Model = Schema.Struct({
	provider: ProviderId,
	model: ModelId
})

export type ModelSpec = typeof ModelSpec.Type
export const ModelSpec = Schema.Struct({
	id: ModelId,
	adapter: AdapterId,
	context: Schema.Number,
	pricing: Schema.Struct({
		input: Schema.Number,
		output: Schema.Number
	})
})

export const catalog: Record<ProviderId, {baseUrl: string; apiKey: Config.Config<string>; models: ModelSpec[]}> = {
	opencode_zen: {
		baseUrl: 'https://opencode.ai/zen/v1',
		apiKey: Config.string('AI_OPENCODE_ZEN'),
		models: [
			{id: 'gpt-5-nano', adapter: 'openai', context: 128_000, pricing: {input: 0, output: 0}},
			{id: 'big-pickle', adapter: 'openai-compatible', context: 128_000, pricing: {input: 0, output: 0}},
			{id: 'kimi-k2.5-free', adapter: 'openai-compatible', context: 128_000, pricing: {input: 0, output: 0}},
			{id: 'claude-haiku-4-5', adapter: 'anthropic', context: 200_000, pricing: {input: 1, output: 5}},
			{id: 'minimax-m2.5-free', adapter: 'anthropic', context: 32_000, pricing: {input: 0, output: 0}}
		]
	},
	openrouter: {
		baseUrl: 'https://openrouter.ai/api/v1',
		apiKey: Config.string('AI_OPENROUTER'),
		models: [
			{
				id: 'nvidia/nemotron-3-nano-30b-a3b:free',
				adapter: 'openrouter',
				context: 32_000,
				pricing: {input: 0, output: 0}
			},
			{id: 'arcee-ai/trinity-mini:free', adapter: 'openrouter', context: 32_000, pricing: {input: 0, output: 0}},
			{id: 'google/gemma-3n-e4b-it:free', adapter: 'openrouter', context: 32_000, pricing: {input: 0, output: 0}}
		]
	}
}
