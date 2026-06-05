import {Array, Config, Record, Schema} from 'effect'

import type {KnownProvider} from '@earendil-works/pi-ai'

export type ThinkingLevel = typeof ThinkingLevel.Type
export const ThinkingLevel = Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)

export const providers = {'openai-codex': {apiKey: Config.redacted('AI_OPENAI_CODEX')}} as const

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.Literals(['pi'] as const)

export const models = [
	{
		agents: ['pi'],
		contextWindow: 400_000,
		model: 'gpt-5.5',
		pricing: {input: 0, output: 0},
		provider: 'openai-codex',
		thinkingLevel: 'low'
	}
] as const satisfies readonly {
	readonly provider: keyof typeof providers & KnownProvider
	readonly model: string
	readonly agents: readonly AgentId[]
	readonly contextWindow: number
	readonly pricing: {readonly input: number; readonly output: number}
	readonly thinkingLevel: ThinkingLevel
}[]

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literals(Record.keys(providers))

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literals(Array.map(models, model => model.model))
