import {Option} from 'effect'

import {Response} from 'effect/unstable/ai'
import {describe, expect, it} from 'vite-plus/test'

import {modelByAlias, priceModelUsages, priceUsage} from './catalog.ts'

function usage(input: {
	readonly cacheRead?: number
	readonly cacheWrite?: number
	readonly input?: number
	readonly output?: number
	readonly reasoning?: number
}) {
	const output = (input.output ?? 0) + (input.reasoning ?? 0)
	return new Response.Usage({
		inputTokens: {
			cacheRead: input.cacheRead ?? 0,
			cacheWrite: input.cacheWrite ?? 0,
			total: input.input ?? 0,
			uncached: Math.max((input.input ?? 0) - (input.cacheRead ?? 0) - (input.cacheWrite ?? 0), 0)
		},
		outputTokens: {reasoning: input.reasoning ?? 0, text: input.output ?? 0, total: output}
	})
}

describe('priceUsage', () => {
	it('prices GPT-5.5 input, cached input, and output tokens', () => {
		expect(priceUsage('gpt-5.5', usage({cacheRead: 100_000, input: 1_100_000, output: 1_000_000}))).toEqual({
			cacheReadUsd: 0.05,
			cacheWriteUsd: 0,
			inputUsd: 5,
			missingPricing: false,
			outputUsd: 30,
			totalUsd: 35.05
		})
	})

	it('prices Claude Opus 4.8 input, output, cache write, and cache read tokens', () => {
		expect(
			priceUsage(
				'claude-opus-4.8',
				usage({cacheRead: 1_000_000, cacheWrite: 1_000_000, input: 3_000_000, output: 1_000_000})
			)
		).toEqual({
			cacheReadUsd: 0.5,
			cacheWriteUsd: 6.25,
			inputUsd: 5,
			missingPricing: false,
			outputUsd: 25,
			totalUsd: 36.75
		})
	})

	it('matches model aliases', () => {
		expect(Option.getOrThrow(modelByAlias('anthropic.claude-opus-4-8')).id).toBe('claude-opus-4.8')
		expect(Option.getOrThrow(modelByAlias('opus-4.8')).id).toBe('claude-opus-4.8')
	})

	it('prices model usage arrays', () => {
		expect(
			priceModelUsages([
				{model: 'gpt-5.5', usage: usage({input: 1_000_000})},
				{model: 'claude-opus-4.8', usage: usage({output: 1_000_000})}
			])
		).toMatchObject({inputUsd: 5, outputUsd: 25, totalUsd: 30})
	})

	it('marks unknown model pricing as missing', () => {
		expect(priceUsage('unknown-model', usage({input: 1})).missingPricing).toBe(true)
	})
})
