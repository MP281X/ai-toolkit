import {Array, Effect, pipe, Stream, String} from 'effect'

import {Prompt} from 'effect/unstable/ai'

import {describe, expect, test} from 'bun:test'
import {Agent} from '../service.ts'

describe('Agent.layerCodex', () => {
	test('streams a Codex SDK response without returning an error part', async () => {
		const parts = await pipe(
			Effect.gen(function* () {
				const agent = yield* Agent

				return yield* pipe(
					agent.streamText({
						provider: 'openai',
						model: 'gpt-5.5',
						messages: [
							Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'Reply with exactly: pong'})]})
						]
					}),
					Stream.runCollect,
					Effect.map(Array.fromIterable)
				)
			}),
			Effect.provide(
				Agent.layerCodex({systemPrompt: Prompt.makeMessage('system', {content: 'Follow instructions exactly.'})})
			),
			Effect.runPromise
		)

		expect(
			pipe(
				parts,
				Array.some(part => part.type === 'error')
			)
		).toBe(false)
		expect(
			pipe(
				parts,
				Array.some(part => part.type === 'text-delta' && pipe(part.delta, String.toLowerCase, String.includes('pong')))
			)
		).toBe(true)
	}, 120_000)
})
