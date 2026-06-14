import {Config} from 'effect'

import type {KnownProvider} from '@earendil-works/pi-ai'

import type {AgentId, ProviderId, ThinkingLevel} from './schema.ts'

export const providers = {'openai-codex': {apiKey: Config.redacted('AI_OPENAI_CODEX')}} as const

export const models = [
	{
		agents: ['pi'],
		contextWindow: 272_000,
		model: 'gpt-5.5',
		pricing: {input: 5, output: 30},
		provider: 'openai-codex',
		thinkingLevel: 'low'
	}
] as const satisfies readonly {
	readonly provider: ProviderId & KnownProvider
	readonly model: string
	readonly agents: readonly AgentId[]
	readonly contextWindow: number
	readonly pricing: {readonly input: number; readonly output: number}
	readonly thinkingLevel: ThinkingLevel
}[]
