import {Array, Config, Record, Schema} from 'effect'

export const providers = {
	opencode: {apiUrl: Config.succeed('https://opencode.ai/zen/v1'), apiKey: Config.redacted('AI_OPENCODE')},
	'opencode-go': {apiUrl: Config.succeed('https://opencode.ai/zen/go/v1'), apiKey: Config.redacted('AI_OPENCODE')},
	openrouter: {apiUrl: Config.succeed('https://openrouter.ai/api/v1'), apiKey: Config.redacted('AI_OPENROUTER')}
}

export const models = [
	{
		provider: 'opencode',
		model: 'gpt-5-nano',
		contextWindow: 400_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'opencode-go',
		model: 'glm-5',
		contextWindow: 202_752,
		pricing: {input: 1, output: 3.2}
	},
	{
		provider: 'opencode-go',
		model: 'deepseek-v4-flash',
		contextWindow: 1_000_000,
		pricing: {input: 0.14, output: 0.28}
	},
	{
		provider: 'openrouter',
		model: 'openai/gpt-oss-20b:free',
		contextWindow: 131_072,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openrouter/free',
		contextWindow: 200_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openai/gpt-5.4-nano',
		contextWindow: 400_000,
		pricing: {input: 0.2, output: 1.25}
	}
] as const satisfies readonly {
	provider: keyof typeof providers
	model: string
	contextWindow: number
	pricing: {input: number; output: number}
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(Record.keys(providers))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(Array.map(models, model => model.model))
