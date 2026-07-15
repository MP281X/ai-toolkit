import {assert, describe, it} from '@effect/vitest'

import {Array, Deferred, Effect, Fiber, Option, Stream, pipe} from 'effect'

import {makeCounter} from '#lib/counter.ts'
import {makeAdminSessions} from '#lib/sessions.ts'

describe('Counter', () => {
	it.effect('seeds every process with the fixed zero-count roster', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
			const first = yield* counter.snapshot

			assert.deepStrictEqual(
				Array.map(first.teams, team => [team.id, team.name, team.count]),
				Array.makeBy(12, index => {
					const suffix = (index + 1).toString().padStart(2, '0')
					return [`team-${suffix}`, `Team ${suffix}`, 0]
				})
			)

			yield* counter.adjust(first.teams[0]!.id, 12, 'add')
			const restarted = yield* makeCounter
			assert.strictEqual((yield* restarted.snapshot).teams[0]!.count, 0)
		})
	)

	it.effect('serializes concurrent deltas and never subtracts below zero', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
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
			const team = (yield* counter.snapshot).teams[0]!

			const amountError = yield* Effect.flip(counter.adjust(team.id, 1.5, 'add'))
			assert.strictEqual(amountError.reason, 'validation')

			const duplicateError = yield* Effect.flip(counter.add(' team 01 '))
			assert.strictEqual(duplicateError.message, 'Team names must be unique.')

			yield* counter.rename(team.id, '  Front Row  ')
			yield* counter.add('Back Row')
			const added = pipe((yield* counter.snapshot).teams, Array.last, Option.getOrThrow)
			assert.strictEqual((yield* counter.snapshot).teams[0]!.name, 'Front Row')
			assert.strictEqual(added.name, 'Back Row')

			yield* counter.remove(added.id)
			assert.strictEqual((yield* counter.snapshot).teams.length, 12)
		})
	)

	it.effect('sends a fresh snapshot before live changes', _context =>
		Effect.gen(function* () {
			const counter = yield* makeCounter
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

describe('AdminSessions', () => {
	it.effect('creates opaque browser sessions and validates the cookie header', _context =>
		Effect.gen(function* () {
			const sessions = makeAdminSessions('secret')
			const invalid = yield* Effect.flip(sessions.authenticate({password: 'wrong', username: 'admin'}))
			assert.strictEqual(invalid.reason, 'auth')

			const token = yield* sessions.authenticate({password: 'secret', username: 'admin'})
			assert.notStrictEqual(token, 'secret')
			assert.isTrue(sessions.valid(token))
			yield* sessions.requireCookieHeader(`beer-counter-session=${token}`)

			const missing = yield* Effect.flip(sessions.requireCookieHeader())
			assert.strictEqual(missing.reason, 'auth')
		})
	)
})
