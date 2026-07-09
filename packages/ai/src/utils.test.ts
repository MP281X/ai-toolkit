import {assert, describe, it} from '@effect/vitest'

import {Effect, Stream, pipe} from 'effect'

import {Response} from 'effect/unstable/ai'

import {AiError} from './schema.ts'
import {finalTextMessage} from './utils.ts'

const usage = new Response.Usage({
	inputTokens: {cacheRead: undefined, cacheWrite: undefined, total: undefined, uncached: undefined},
	outputTokens: {reasoning: undefined, text: undefined, total: undefined}
})

function text(delta: string) {
	return Response.makePart('text-delta', {delta, id: 'text'})
}

function finish() {
	return Response.makePart('finish', {reason: 'stop', response: undefined, usage})
}

describe('finalTextMessage', () => {
	it.effect('returns the trimmed text run before finish', _context =>
		Effect.gen(function* () {
			const message = yield* finalTextMessage(
				Stream.fromIterable([
					text('  commit'),
					Response.makePart('response-metadata', {
						id: 'response',
						modelId: 'model',
						request: undefined,
						timestamp: undefined
					}),
					text(' message  '),
					finish()
				])
			)

			assert.strictEqual(message, 'commit message')
		})
	)

	it.effect('keeps text after a reasoning reset', _context =>
		Effect.gen(function* () {
			const message = yield* finalTextMessage(
				Stream.fromIterable([
					text('first'),
					Response.makePart('reasoning-delta', {delta: 'thinking', id: 'reasoning'}),
					text('second'),
					finish()
				])
			)

			assert.strictEqual(message, 'second')
		})
	)

	it.effect('ignores non-delta reasoning parts', _context =>
		Effect.gen(function* () {
			const message = yield* finalTextMessage(
				Stream.fromIterable([
					text('first'),
					Response.makePart('reasoning-start', {id: 'reasoning'}),
					Response.makePart('reasoning-end', {id: 'reasoning'}),
					text('second'),
					finish()
				])
			)

			assert.strictEqual(message, 'firstsecond')
		})
	)

	it.effect('fails when reasoning clears the final text', _context =>
		Effect.gen(function* () {
			const error = yield* pipe(
				finalTextMessage(
					Stream.fromIterable([
						text('first'),
						finish(),
						text('ignored'),
						Response.makePart('reasoning-delta', {delta: 'thinking', id: 'reasoning'}),
						finish()
					])
				),
				Effect.flip
			)

			assert.instanceOf(error, AiError)
		})
	)

	it.effect('fails when the final text is empty after trimming', _context =>
		Effect.gen(function* () {
			const error = yield* pipe(finalTextMessage(Stream.fromIterable([text('   '), finish()])), Effect.flip)

			assert.instanceOf(error, AiError)
		})
	)
})
