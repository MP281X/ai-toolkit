import {Array, Config, Effect, Option, PubSub, Semaphore, Stream, SubscriptionRef, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import {CounterChanged, CounterError, CounterSnapshot, CounterState, RpcContracts, Team} from '#rpcs/contracts.ts'

function seedTeams() {
	return Array.makeBy(12, index => {
		const number = index + 1
		const suffix = `${number < 10 ? '0' : ''}${number}`
		return Team.make({count: 0, id: `team-${suffix}`, name: `Team ${suffix}`, order: index})
	})
}

function ordered(teams: readonly Team[]) {
	return [...teams].toSorted((left, right) => right.count - left.count || left.order - right.order)
}

function validation(message: string) {
	return new CounterError({message, reason: 'validation'})
}

function authError() {
	return new CounterError({message: 'Invalid admin credentials', reason: 'auth'})
}

function normalizeName(name: string) {
	return name.trim()
}

function isUniqueName(teams: readonly Team[], name: string, exceptId?: string) {
	const normalized = name.toLocaleLowerCase()
	return !Array.some(teams, team => team.id !== exceptId && team.name.toLocaleLowerCase() === normalized)
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const password = yield* Config.string('ADMIN_PASSWORD').pipe(Config.withDefault('beer-counter'))
		const store = yield* KeyValueStore.KeyValueStore
		const schemaStore = KeyValueStore.toSchemaStore(store, CounterState)
		const stored = yield* schemaStore
			.get('beer-counter-state')
			.pipe(Effect.mapError(() => new CounterError({message: 'Unable to load counter state', reason: 'storage'})))
		const initial = pipe(
			stored,
			Option.getOrElse(() => CounterState.make({teams: seedTeams()}))
		)
		if (Option.isNone(stored)) {
			yield* schemaStore
				.set('beer-counter-state', initial)
				.pipe(Effect.mapError(() => new CounterError({message: 'Unable to seed counter state', reason: 'storage'})))
		}

		const state = yield* SubscriptionRef.make(initial)
		const events = yield* PubSub.unbounded<CounterSnapshot | CounterChanged>()
		const semaphore = yield* Semaphore.make(1)

		function verify(credentials: {readonly password: string; readonly username: string}) {
			return credentials.username === 'admin' && credentials.password === password
				? Effect.void
				: Effect.fail(authError())
		}

		function commit(update: (current: CounterState) => Effect.Effect<CounterState, CounterError>) {
			return semaphore.withPermit(
				Effect.gen(function* () {
					const current = yield* SubscriptionRef.get(state)
					const next = yield* update(current)
					yield* schemaStore
						.set('beer-counter-state', next)
						.pipe(Effect.mapError(() => new CounterError({message: 'Unable to save counter state', reason: 'storage'})))
					yield* SubscriptionRef.set(state, next)
					yield* PubSub.publish(events, CounterChanged.make({teams: ordered(next.teams)}))
				})
			)
		}

		return RpcContracts.of({
			'counter.add': Effect.fn('CounterRpc.add')(function* (payload) {
				yield* verify(payload)
				const name = normalizeName(payload.name)
				if (name.length === 0) return yield* validation('Team name is required')
				yield* commit(current => {
					if (!isUniqueName(current.teams, name)) return Effect.fail(validation('Team name must be unique'))
					const nextOrder = Math.max(-1, ...Array.map(current.teams, team => team.order)) + 1
					return Effect.succeed(
						CounterState.make({
							teams: Array.append(current.teams, Team.make({count: 0, id: crypto.randomUUID(), name, order: nextOrder}))
						})
					)
				})
			}),
			'counter.adjust': Effect.fn('CounterRpc.adjust')(function* (payload) {
				yield* verify(payload)
				if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
					return yield* validation('Amount must be a positive whole number')
				}
				yield* commit(current => {
					const team = pipe(
						current.teams,
						Array.findFirst(candidate => candidate.id === payload.id),
						Option.getOrUndefined
					)
					if (!team) return Effect.fail(validation('Team not found'))
					const count = payload.direction === 'add' ? team.count + payload.amount : team.count - payload.amount
					if (count < 0) return Effect.fail(validation('Count cannot be negative'))
					return Effect.succeed(
						CounterState.make({
							teams: Array.map(current.teams, candidate =>
								candidate.id === payload.id ? Team.make({...candidate, count}) : candidate
							)
						})
					)
				})
			}),
			'counter.remove': Effect.fn('CounterRpc.remove')(function* (payload) {
				yield* verify(payload)
				yield* commit(current => {
					if (!Array.some(current.teams, team => team.id === payload.id)) {
						return Effect.fail(validation('Team not found'))
					}
					return Effect.succeed(CounterState.make({teams: Array.filter(current.teams, team => team.id !== payload.id)}))
				})
			}),
			'counter.rename': Effect.fn('CounterRpc.rename')(function* (payload) {
				yield* verify(payload)
				const name = normalizeName(payload.name)
				if (name.length === 0) return yield* validation('Team name is required')
				yield* commit(current => {
					if (!Array.some(current.teams, team => team.id === payload.id)) {
						return Effect.fail(validation('Team not found'))
					}
					if (!isUniqueName(current.teams, name, payload.id)) return Effect.fail(validation('Team name must be unique'))
					return Effect.succeed(
						CounterState.make({
							teams: Array.map(current.teams, team => (team.id === payload.id ? Team.make({...team, name}) : team))
						})
					)
				})
			}),
			'counter.watch': () =>
				Stream.unwrap(
					Effect.gen(function* () {
						const snapshot = yield* SubscriptionRef.get(state)
						return pipe(
							Stream.make(CounterSnapshot.make({teams: ordered(snapshot.teams)})),
							Stream.concat(Stream.fromPubSub(events))
						)
					})
				)
		})
	})
)
