import {Config, Schema} from 'effect'

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(['opencode_zen', 'openrouter'])

export type AdapterId = typeof AdapterId.Type
export const AdapterId = Schema.Literals(['openai', 'openai-compatible', 'anthropic', 'openrouter'])

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals([
	'openrouter/free',
	'gpt-5-nano',
	'big-pickle',
	'kimi-k2.5-free',
	'claude-haiku-4-5',
	'minimax-m2.5-free',
	'openai/gpt-oss-20b:free',
	'arcee-ai/trinity-mini:free',
	'google/gemma-3n-e4b-it:free',
	'nvidia/nemotron-3-nano-30b-a3b:free'
])

export const catalog: Record<
	ProviderId,
	{
		baseURL: string
		apiKey: Config.Config<string>
		models: {id: ModelId; adapter: AdapterId; context: number; pricing: {input: number; output: number}}[]
	}
> = {
	opencode_zen: {
		baseURL: 'https://opencode.ai/zen/v1',
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
		baseURL: 'https://openrouter.ai/api/v1',
		apiKey: Config.string('AI_OPENROUTER'),
		models: [
			{id: 'openai/gpt-oss-20b:free', adapter: 'openrouter', context: 32_000, pricing: {input: 0, output: 0}},
			{id: 'openrouter/free', adapter: 'openrouter', context: 32_000, pricing: {input: 0, output: 0}},
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
