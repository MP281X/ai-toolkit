import {Config, Record, Schema} from 'effect'

export const providers = {
	opencode_zen: {apiUrl: Config.succeed('https://opencode.ai/zen/v1'), apiKey: Config.redacted('AI_OPENCODE_ZEN')},
	openrouter: {apiUrl: Config.succeed('https://openrouter.ai/api/v1'), apiKey: Config.redacted('AI_OPENROUTER')}
}

export const models = [
	{
		provider: 'opencode_zen',
		model: 'gpt-5-nano',
		adapter: 'openai',
		contextWindow: 128_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'opencode_zen',
		model: 'big-pickle',
		adapter: 'openai-compatible',
		contextWindow: 128_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'opencode_zen',
		model: 'minimax-m2.5-free',
		adapter: 'anthropic',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openai/gpt-oss-20b:free',
		adapter: 'openrouter',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openrouter/free',
		adapter: 'openrouter',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	}
] as const satisfies readonly {
	provider: keyof typeof providers
	model: string
	adapter: string
	contextWindow: number
	pricing: {input: number; output: number}
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(Record.keys(providers))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(models.map(model => model.model))

export type AdapterId = typeof AdapterId.Type
export const AdapterId = Schema.Literals(models.map(model => model.adapter))
