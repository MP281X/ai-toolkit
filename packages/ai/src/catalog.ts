import {Schema} from 'effect'

export const providers = [
	{
		id: 'opencode_zen',
		baseUrl: 'https://opencode.ai/zen/v1',
		apiKeyEnv: 'AI_OPENCODE_ZEN'
	},
	{
		id: 'openrouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		apiKeyEnv: 'AI_OPENROUTER'
	},
	{
		id: 'github-copilot',
		baseUrl: 'https://api.githubcopilot.com',
		apiKeyEnv: undefined
	}
] as const

export const offerings = [
	{
		agents: ['ai', 'opencode'],
		provider: 'opencode_zen',
		model: 'gpt-5-nano',
		adapter: 'openai',
		contextWindow: 128_000,
		pricing: {input: 0, output: 0}
	},
	{
		agents: ['ai', 'opencode'],
		provider: 'opencode_zen',
		model: 'big-pickle',
		adapter: 'openai-compatible',
		contextWindow: 128_000,
		pricing: {input: 0, output: 0}
	},
	{
		agents: ['ai', 'opencode'],
		provider: 'opencode_zen',
		model: 'minimax-m2.5-free',
		adapter: 'anthropic',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	},
	{
		agents: ['ai', 'opencode'],
		provider: 'openrouter',
		model: 'openai/gpt-oss-20b:free',
		adapter: 'openrouter',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	},
	{
		agents: ['ai', 'opencode'],
		provider: 'openrouter',
		model: 'openrouter/free',
		adapter: 'openrouter',
		contextWindow: 32_000,
		pricing: {input: 0, output: 0}
	},
	{
		agents: ['copilot', 'opencode'],
		provider: 'github-copilot',
		model: 'gpt-5-mini',
		adapter: 'openai',
		contextWindow: 192_000,
		pricing: {input: 0, output: 0}
	}
] as const satisfies {
	agents: string[]
	provider: ProviderId
	model: string
	adapter: string
	contextWindow: number
	pricing: {input: number; output: number}
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(providers.map(p => p.id))

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.Literals(offerings.flatMap(o => o.agents))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(offerings.map(o => o.model))

export type AdapterId = typeof AdapterId.Type
export const AdapterId = Schema.Literals(offerings.map(o => o.adapter))

export type ModelSelection = typeof ModelSelection.Type
export const ModelSelection = Schema.Struct({agent: AgentId, provider: ProviderId, model: ModelId})
