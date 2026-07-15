import type {Stream} from 'effect'
import {Array, Config, Context, Effect, Layer, Option, Predicate, Schema, String, SubscriptionRef, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import type {Credentials} from '#rpcs/contracts.ts'
import {BeerCounterError, BeerState, Team} from '#rpcs/contracts.ts'

const PersistedBeerState = Schema.fromJsonString(BeerState)

const initialState = BeerState.make({
	teams: Array.makeBy(12, index => {
		const number = index + 1
		return Team.make({
			count: 0,
			createdOrder: index,
			id: `team-${number.toString().padStart(2, '0')}`,
			name: `Team ${number.toString().padStart(2, '0')}`
		})
	})
})

function commandError(message: string) {
	return new BeerCounterError({message})
}

function normalizedName(name: string) {
	return pipe(name, String.trim)
}

function requireName(state: BeerState, name: string, ownId?: string) {
	const trimmed = normalizedName(name)
	if (String.isEmpty(trimmed)) return Effect.fail(commandError('Team name is required.'))

	const normalized = pipe(trimmed, String.toLowerCase)
	const duplicate = pipe(
		state.teams,
		Array.some(team => team.id !== ownId && pipe(team.name, String.toLowerCase) === normalized)
	)

	return duplicate ? Effect.fail(commandError('Team names must be unique.')) : Effect.succeed(trimmed)
}

function requireTeam(state: BeerState, id: string) {
	return pipe(
		state.teams,
		Array.findFirst(candidate => candidate.id === id),
		Option.match({onNone: () => Effect.fail(commandError('Team no longer exists.')), onSome: Effect.succeed})
	)
}

export class BeerCounter extends Context.Service<
	BeerCounter,
	{
		readonly add: (credentials: Credentials, name: string) => Effect.Effect<void, BeerCounterError>
		readonly adjust: (
			credentials: Credentials,
			id: string,
			amount: number,
			direction: 'add' | 'subtract'
		) => Effect.Effect<void, BeerCounterError>
		readonly authenticate: (credentials: Credentials) => Effect.Effect<void, BeerCounterError>
		readonly changes: Stream.Stream<BeerState>
		readonly remove: (credentials: Credentials, id: string) => Effect.Effect<void, BeerCounterError>
		readonly rename: (credentials: Credentials, id: string, name: string) => Effect.Effect<void, BeerCounterError>
	}
>()('beer-counter/BeerCounter') {}

export const makeBeerCounter = Effect.fn('BeerCounter.make')(function* (adminPassword: string) {
	const storage = yield* KeyValueStore.KeyValueStore
	const stored = yield* storage
		.get('beer-counter-state')
		.pipe(Effect.mapError(() => commandError('Could not read beer-counter storage.')))
	const currentState = Predicate.isNotUndefined(stored)
		? yield* Schema.decodeUnknownEffect(PersistedBeerState)(stored).pipe(
				Effect.mapError(() => commandError('Beer-counter storage is invalid.'))
			)
		: initialState

	if (Predicate.isUndefined(stored)) {
		const encoded = yield* Schema.encodeEffect(PersistedBeerState)(currentState).pipe(
			Effect.mapError(() => commandError('Could not encode beer-counter storage.'))
		)
		yield* storage
			.set('beer-counter-state', encoded)
			.pipe(Effect.mapError(() => commandError('Could not initialize beer-counter storage.')))
	}

	const state = yield* SubscriptionRef.make(currentState)

	const authenticate = Effect.fn('BeerCounter.authenticate')(function* (credentials: Credentials) {
		if (credentials.username !== 'admin' || credentials.password !== adminPassword) {
			return yield* commandError('Invalid username or password.')
		}
	})

	const persist = Effect.fn('BeerCounter.persist')(function* (nextState: BeerState) {
		const encoded = yield* Schema.encodeEffect(PersistedBeerState)(nextState).pipe(
			Effect.mapError(() => commandError('Could not encode beer-counter storage.'))
		)
		yield* storage
			.set('beer-counter-state', encoded)
			.pipe(Effect.mapError(() => commandError('Could not save changes.')))
		return nextState
	})

	const mutate = Effect.fn('BeerCounter.mutate')(function* (
		credentials: Credentials,
		change: (current: BeerState) => Effect.Effect<BeerState, BeerCounterError>
	) {
		yield* authenticate(credentials)
		yield* SubscriptionRef.updateEffect(state, current => pipe(change(current), Effect.flatMap(persist)))
	})

	return BeerCounter.of({
		add: (credentials, name) =>
			mutate(credentials, current =>
				Effect.gen(function* () {
					const validName = yield* requireName(current, name)
					const createdOrder =
						pipe(
							current.teams,
							Array.reduce(-1, (maximum, team) => Math.max(maximum, team.createdOrder))
						) + 1
					return BeerState.make({
						teams: pipe(
							current.teams,
							Array.append(Team.make({count: 0, createdOrder, id: crypto.randomUUID(), name: validName}))
						)
					})
				})
			),
		adjust: (credentials, id, amount, direction) =>
			mutate(credentials, current =>
				Effect.gen(function* () {
					if (!(Number.isInteger(amount) && amount > 0)) {
						return yield* commandError('Amount must be a positive whole number.')
					}
					const team = yield* requireTeam(current, id)
					const count = direction === 'add' ? team.count + amount : Math.max(0, team.count - amount)
					return BeerState.make({
						teams: pipe(
							current.teams,
							Array.map(candidate => (candidate.id === id ? Team.make({...candidate, count}) : candidate))
						)
					})
				})
			),
		authenticate,
		changes: SubscriptionRef.changes(state),
		remove: (credentials, id) =>
			mutate(credentials, current =>
				Effect.gen(function* () {
					yield* requireTeam(current, id)
					return BeerState.make({
						teams: pipe(
							current.teams,
							Array.filter(team => team.id !== id)
						)
					})
				})
			),
		rename: (credentials, id, name) =>
			mutate(credentials, current =>
				Effect.gen(function* () {
					yield* requireTeam(current, id)
					const validName = yield* requireName(current, name, id)
					return BeerState.make({
						teams: pipe(
							current.teams,
							Array.map(team => (team.id === id ? Team.make({...team, name: validName}) : team))
						)
					})
				})
			)
	})
})

export const BeerCounterLive = Layer.effect(
	BeerCounter,
	pipe(Config.string('ADMIN_PASSWORD'), Config.withDefault('beer-counter'), Effect.flatMap(makeBeerCounter))
)
