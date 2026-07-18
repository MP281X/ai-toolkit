import {assert, describe, it} from '@effect/vitest'

import {Array, Deferred, Effect, Fiber, Option, Stream, pipe} from 'effect'

import {makeAdminAuth} from '#lib/adminAuth.ts'
import {makeCounter} from '#lib/counter.ts'

describe('Counter', () => {
	it.effect('starts every process with an empty roster', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
			const first = yield* counter.snapshot

			assert.deepStrictEqual(first.teams, [])

			yield* counter.add('Front Row')
			const restarted = yield* makeCounter
			assert.deepStrictEqual((yield* restarted.snapshot).teams, [])
		})
	)

	it.effect('serializes concurrent deltas and never subtracts below zero', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
			yield* counter.add('Front Row')
			const team = (yield* counter.snapshot).teams[0]!

			yield* Effect.all(
				Array.makeBy(40, () => counter.adjust(team.id, 1, 'add')),
				{concurrency: 'unbounded'}
			)
			assert.strictEqual((yield* counter.snapshot).teams[0]!.count, 40)

			yield* counter.adjust(team.id, 100, 'subtract')
			assert.strictEqual((yield* counter.snapshot).teams[0]!.count, 0)
		})
	)

	it.effect('validates deltas and trimmed case-insensitive team names', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
			yield* counter.add('Team 01')
			const team = (yield* counter.snapshot).teams[0]!

			const amountError = yield* Effect.flip(counter.adjust(team.id, 1.5, 'add'))
			assert.strictEqual(amountError.reason, 'validation')

			const duplicateError = yield* Effect.flip(counter.add(' team 01 '))
			assert.strictEqual(duplicateError.message, 'Team names must be unique.')

			yield* counter.add('  Front Row  ')
			const front = pipe((yield* counter.snapshot).teams, Array.last, Option.getOrThrow)
			yield* counter.add('Back Row')
			const added = pipe((yield* counter.snapshot).teams, Array.last, Option.getOrThrow)
			assert.strictEqual(front.name, 'Front Row')
			assert.strictEqual(added.name, 'Back Row')

			yield* counter.remove(added.id)
			assert.strictEqual((yield* counter.snapshot).teams.length, 2)
		})
	)

	it.effect('sends a fresh snapshot before live changes', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
			yield* counter.add('Front Row')
			const ready = yield* Deferred.make<boolean>()
			const eventsFiber = yield* pipe(
				counter.changes,
				Stream.tap(event => (event._tag === 'CounterSnapshot' ? Deferred.succeed(ready, true) : Effect.void)),
				Stream.take(2),
				Stream.runCollect,
				Effect.forkChild
			)

			yield* Deferred.await(ready)
			const team = (yield* counter.snapshot).teams[0]!
			yield* counter.adjust(team.id, 3, 'add')
			const events = Array.fromIterable(yield* Fiber.join(eventsFiber))

			assert.strictEqual(events[0]?._tag, 'CounterSnapshot')
			assert.strictEqual(events[1]?._tag, 'CounterChanged')
			assert.strictEqual(pipe(events, Array.get(1), Option.getOrThrow).state.teams[0]!.count, 3)
		})
	)
})

describe('AdminAuth', () => {
	it.effect('validates login tokens and RPC cookie headers', _context =>
		Effect.gen(function* () {
			const auth = makeAdminAuth('secret')
			const invalid = yield* Effect.flip(auth.requireToken('wrong'))
			assert.strictEqual(invalid.reason, 'auth')

			yield* auth.requireToken('secret')
			yield* auth.requireCookieHeader('beer-counter-admin-token=secret')

			const missing = yield* Effect.flip(auth.requireCookieHeader())
			assert.strictEqual(missing.reason, 'auth')
		})
	)
})
