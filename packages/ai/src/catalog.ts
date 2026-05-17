import {Array, Config, Record, Schema} from 'effect'

export const providers = {
	openai: {apiKey: Config.redacted('AI_OPENAI'), apiUrl: Config.succeed('https://api.openai.com/v1')},
	'opencode-go': {apiKey: Config.redacted('AI_OPENCODE'), apiUrl: Config.succeed('https://opencode.ai/zen/go/v1')},
	openrouter: {apiKey: Config.redacted('AI_OPENROUTER'), apiUrl: Config.succeed('https://openrouter.ai/api/v1')}
} as const

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.Literals(['effect', 'codex'] as const)

export const models = [
	{
		agents: ['effect'],
		contextWindow: 202_752,
		model: 'glm-5',
		pricing: {input: 1, output: 3.2},
		provider: 'opencode-go'
	},
	{
		agents: ['effect'],
		contextWindow: 1_000_000,
		model: 'deepseek-v4-flash',
		pricing: {input: 0.14, output: 0.28},
		provider: 'opencode-go'
	},
	{
		agents: ['effect'],
		contextWindow: 131_072,
		model: 'openai/gpt-oss-20b:free',
		pricing: {input: 0, output: 0},
		provider: 'openrouter'
	},
	{
		agents: ['effect'],
		contextWindow: 200_000,
		model: 'openrouter/free',
		pricing: {input: 0, output: 0},
		provider: 'openrouter'
	},
	{
		agents: ['effect'],
		contextWindow: 400_000,
		model: 'openai/gpt-5.4-nano',
		pricing: {input: 0.2, output: 1.25},
		provider: 'openrouter'
	},
	{
		agents: ['effect'],
		contextWindow: 400_000,
		model: 'gpt-5.4-mini',
		pricing: {input: 0, output: 0},
		provider: 'openrouter'
	},
	{
		agents: ['effect', 'codex'],
		contextWindow: 400_000,
		model: 'gpt-5.5',
		pricing: {input: 0, output: 0},
		provider: 'openai'
	},
	{
		agents: ['effect', 'codex'],
		contextWindow: 400_000,
		model: 'gpt-5.4-mini',
		pricing: {input: 0, output: 0},
		provider: 'openai'
	}
] as const satisfies readonly {
	readonly provider: keyof typeof providers
	readonly model: string
	readonly agents: readonly AgentId[]
	readonly contextWindow: number
	readonly pricing: {readonly input: number; readonly output: number}
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(Record.keys(providers))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(Array.map(models, model => model.model))
