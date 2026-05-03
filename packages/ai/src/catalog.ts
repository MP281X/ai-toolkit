import {Array, Config, Record, Schema} from 'effect'

export const providers = {
	openai: {apiUrl: Config.succeed('https://api.openai.com/v1'), apiKey: Config.redacted('AI_OPENAI')},
	'opencode-go': {apiUrl: Config.succeed('https://opencode.ai/zen/go/v1'), apiKey: Config.redacted('AI_OPENCODE')},
	openrouter: {apiUrl: Config.succeed('https://openrouter.ai/api/v1'), apiKey: Config.redacted('AI_OPENROUTER')}
}

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.Literals(['effect', 'codex'] as const)

export const models = [
	{
		provider: 'opencode-go',
		model: 'glm-5',
		agents: ['effect'],
		contextWindow: 202_752,
		pricing: {input: 1, output: 3.2}
	},
	{
		provider: 'opencode-go',
		model: 'deepseek-v4-flash',
		agents: ['effect'],
		contextWindow: 1_000_000,
		pricing: {input: 0.14, output: 0.28}
	},
	{
		provider: 'openrouter',
		model: 'openai/gpt-oss-20b:free',
		agents: ['effect'],
		contextWindow: 131_072,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openrouter/free',
		agents: ['effect'],
		contextWindow: 200_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openrouter',
		model: 'openai/gpt-5.4-nano',
		agents: ['effect'],
		contextWindow: 400_000,
		pricing: {input: 0.2, output: 1.25}
	},
	{
		provider: 'openrouter',
		model: 'gpt-5.4-mini',
		agents: ['effect'],
		contextWindow: 400_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openai',
		model: 'gpt-5.5',
		agents: ['effect', 'codex'],
		contextWindow: 400_000,
		pricing: {input: 0, output: 0}
	},
	{
		provider: 'openai',
		model: 'gpt-5.4-mini',
		agents: ['effect', 'codex'],
		contextWindow: 400_000,
		pricing: {input: 0, output: 0}
	}
] as const satisfies readonly {
	provider: keyof typeof providers
	model: string
	agents: readonly AgentId[]
	contextWindow: number
	pricing: {input: number; output: number}
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(Record.keys(providers))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(Array.map(models, model => model.model))
