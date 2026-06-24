import {Array, Option, Schema, String, pipe} from 'effect'

import type {Response} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

const models = [
	{
		aliases: ['gpt-5.5'],
		contextWindow: 400_000,
		id: 'gpt-5.5',
		pricing: {cacheRead: 0.5, cacheWrite: 0, input: 5, output: 30},
		provider: 'openai'
	},
	{
		aliases: ['anthropic.claude-opus-4-8', 'claude-opus-4-8', 'claude-opus-4.8', 'opus-4-8', 'opus-4.8'],
		contextWindow: 200_000,
		id: 'claude-opus-4.8',
		pricing: {cacheRead: 0.5, cacheWrite: 6.25, input: 5, output: 25},
		provider: 'anthropic'
	}
] as const satisfies readonly {
	readonly aliases: readonly string[]
	readonly contextWindow: number
	readonly id: string
	readonly pricing?: {
		readonly cacheRead?: number
		readonly cacheWrite?: number
		readonly input: number
		readonly output: number
	}
	readonly provider: 'anthropic' | 'openai'
}[]

export type ModelId = (typeof models)[number]['id']
export const ModelId = Schema.Literals(Array.map(models, model => model.id))

export const agentCommandProfiles = [
	{
		command: (cwd: string) =>
			ChildProcess.make(
				'codex',
				['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=medium', '--dangerously-bypass-approvals-and-sandbox'],
				{cwd}
			),
		icon: 'codex',
		id: 'codex-gpt-5.5',
		label: 'codex',
		model: 'gpt-5.5',
		usageProvider: 'codex'
	},
	{
		command: (cwd: string) =>
			ChildProcess.make(
				'claude',
				['--model', 'claude-opus-4-8', '--permission-mode', 'bypassPermissions', '--effort', 'high'],
				{cwd, env: {CLAUDE_CODE_NO_FLICKER: '1'}, extendEnv: true}
			),
		icon: 'claude',
		id: 'claude-code-opus-4.8',
		label: 'claude',
		model: 'claude-opus-4.8',
		usageProvider: 'claude'
	}
] as const

export const AgentCommandProfileId = Schema.Literals(Array.map(agentCommandProfiles, profile => profile.id))

export const AgentCommandIcon = Schema.Literals(Array.map(agentCommandProfiles, profile => profile.icon))

export type UsageProviderId = typeof UsageProviderId.Type
export const UsageProviderId = Schema.Literals(
	Array.dedupe(Array.map(agentCommandProfiles, profile => profile.usageProvider))
)

const emptyPrice = {cacheReadUsd: 0, cacheWriteUsd: 0, inputUsd: 0, missingPricing: false, outputUsd: 0, totalUsd: 0}

function normalizeModel(model: string) {
	return pipe(model, String.trim, String.toLowerCase)
}

export function modelByAlias(model: string | undefined) {
	const normalized = normalizeModel(model ?? '')
	return pipe(
		models,
		Array.findFirst(candidate =>
			pipe(
				[candidate.id, ...candidate.aliases],
				Array.some(alias => normalizeModel(alias) === normalized)
			)
		)
	)
}

function price(tokens: number | undefined, usdPerMillion = 0) {
	return ((tokens ?? 0) * usdPerMillion) / 1_000_000
}

export function priceUsage(model: string | undefined, usage: Response.Usage) {
	return pipe(
		modelByAlias(model),
		Option.match({
			onNone: () => ({...emptyPrice, missingPricing: true}),
			onSome: catalogModel => {
				const inputUsd = price(usage.inputTokens.uncached, catalogModel.pricing.input)
				const outputUsd = price(usage.outputTokens.total, catalogModel.pricing.output)
				const cacheWriteUsd = price(usage.inputTokens.cacheWrite, catalogModel.pricing.cacheWrite)
				const cacheReadUsd = price(usage.inputTokens.cacheRead, catalogModel.pricing.cacheRead)

				return {
					cacheReadUsd,
					cacheWriteUsd,
					inputUsd,
					missingPricing: false,
					outputUsd,
					totalUsd: inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd
				}
			}
		})
	)
}

function addPrice(left: typeof emptyPrice, right: typeof emptyPrice) {
	return {
		cacheReadUsd: left.cacheReadUsd + right.cacheReadUsd,
		cacheWriteUsd: left.cacheWriteUsd + right.cacheWriteUsd,
		inputUsd: left.inputUsd + right.inputUsd,
		missingPricing: left.missingPricing || right.missingPricing,
		outputUsd: left.outputUsd + right.outputUsd,
		totalUsd: left.totalUsd + right.totalUsd
	}
}

export function priceModelUsages(usages: readonly {readonly model?: string; readonly usage: Response.Usage}[]) {
	return pipe(
		usages,
		Array.reduce(emptyPrice, (total, item) => addPrice(total, priceUsage(item.model, item.usage)))
	)
}
