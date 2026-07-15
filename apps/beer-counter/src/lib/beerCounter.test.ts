import {assert, describe, it} from '@effect/vitest'

import {Array, Effect, Option, Ref, Stream, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import type {BeerCounter} from '#lib/beerCounter.ts'
import {makeBeerCounter} from '#lib/beerCounter.ts'

const credentials = {password: 'secret', username: 'admin'}

const snapshot = Effect.fn('BeerCounterTest.snapshot')(function* (counter: BeerCounter['Service']) {
	return Option.getOrThrow(yield* counter.changes.pipe(Stream.take(1), Stream.runHead))
})

describe('BeerCounter', () => {
	it.effect('seeds and persists the default roster', () =>
		Effect.gen(function* () {
			const first = yield* makeBeerCounter('secret')
			const initial = yield* snapshot(first)

			assert.strictEqual(initial.teams.length, 12)
			assert.deepStrictEqual(
				pipe(
					initial.teams,
					Array.map(team => [team.name, team.count])
				),
				[
					['Team 01', 0],
					['Team 02', 0],
					['Team 03', 0],
					['Team 04', 0],
					['Team 05', 0],
					['Team 06', 0],
					['Team 07', 0],
					['Team 08', 0],
					['Team 09', 0],
					['Team 10', 0],
					['Team 11', 0],
					['Team 12', 0]
				]
			)

			yield* first.adjust(credentials, initial.teams[0]!.id, 12, 'add')
			const restarted = yield* makeBeerCounter('secret')
			assert.strictEqual((yield* snapshot(restarted)).teams[0]!.count, 12)
		}).pipe(Effect.provide(KeyValueStore.layerMemory))
	)

	it.effect('serializes concurrent deltas and never subtracts below zero', () =>
		Effect.gen(function* () {
			const counter = yield* makeBeerCounter('secret')
			const initial = yield* snapshot(counter)

			yield* Effect.all(
				Array.makeBy(40, () => counter.adjust(credentials, initial.teams[0]!.id, 1, 'add')),
				{concurrency: 'unbounded'}
			)
			yield* counter.adjust(credentials, initial.teams[0]!.id, 100, 'subtract')

			assert.strictEqual((yield* snapshot(counter)).teams[0]!.count, 0)
		}).pipe(Effect.provide(KeyValueStore.layerMemory))
	)

	it.effect('rejects invalid credentials, deltas, and duplicate names', () =>
		Effect.gen(function* () {
			const counter = yield* makeBeerCounter('secret')
			const team = (yield* snapshot(counter)).teams[0]!

			const authenticationError = yield* Effect.flip(counter.authenticate({password: 'wrong', username: 'admin'}))
			assert.strictEqual(authenticationError.message, 'Invalid username or password.')

			const amountError = yield* Effect.flip(counter.adjust(credentials, team.id, 1.5, 'add'))
			assert.strictEqual(amountError.message, 'Amount must be a positive whole number.')

			const nameError = yield* Effect.flip(counter.add(credentials, ' team 01 '))
			assert.strictEqual(nameError.message, 'Team names must be unique.')
			assert.strictEqual((yield* snapshot(counter)).teams.length, 12)
		}).pipe(Effect.provide(KeyValueStore.layerMemory))
	)

	it.effect('does not publish a mutation when persistence fails', () =>
		Effect.gen(function* () {
			const memory = yield* KeyValueStore.KeyValueStore
			const rejectWrites = yield* Ref.make(false)
			const controlled = KeyValueStore.KeyValueStore.of({
				...memory,
				set: (key, value) =>
					pipe(
						Ref.get(rejectWrites),
						Effect.flatMap(rejected =>
							rejected
								? Effect.fail(new KeyValueStore.KeyValueStoreError({key, message: 'rejected', method: 'set'}))
								: memory.set(key, value)
						)
					)
			})
			const counter = yield* makeBeerCounter('secret').pipe(
				Effect.provideService(KeyValueStore.KeyValueStore, controlled)
			)
			const initial = yield* snapshot(counter)

			yield* Ref.set(rejectWrites, true)
			const error = yield* Effect.flip(counter.adjust(credentials, initial.teams[0]!.id, 3, 'add'))

			assert.strictEqual(error.message, 'Could not save changes.')
			assert.strictEqual((yield* snapshot(counter)).teams[0]!.count, 0)
		}).pipe(Effect.provide(KeyValueStore.layerMemory))
	)
})
