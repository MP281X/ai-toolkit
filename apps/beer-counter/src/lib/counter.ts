import {Array, Context, Effect, Layer, Option, PubSub, Ref, Semaphore, Stream, String, pipe} from 'effect'

import {CounterChanged, CounterError, CounterSnapshot, CounterState, Team} from '#rpcs/contracts.ts'

function validationError(message: string) {
	return new CounterError({message, reason: 'validation'})
}

function initialState() {
	return CounterState.make({
		teams: Array.makeBy(12, index => {
			const number = index + 1
			const suffix = number.toString().padStart(2, '0')
			return Team.make({count: 0, createdOrder: index, id: `team-${suffix}`, name: `Team ${suffix}`})
		})
	})
}

function requireName(state: CounterState, name: string, ownId?: string) {
	const trimmed = pipe(name, String.trim)
	if (String.isEmpty(trimmed)) return Effect.fail(validationError('Team name is required.'))

	const normalized = pipe(trimmed, String.toLowerCase)
	const duplicate = Array.some(
		state.teams,
		team => team.id !== ownId && pipe(team.name, String.toLowerCase) === normalized
	)

	return duplicate ? Effect.fail(validationError('Team names must be unique.')) : Effect.succeed(trimmed)
}

function requireTeam(state: CounterState, id: string) {
	return pipe(
		state.teams,
		Array.findFirst(team => team.id === id),
		Option.match({onNone: () => Effect.fail(validationError('Team no longer exists.')), onSome: Effect.succeed})
	)
}

export class Counter extends Context.Service<
	Counter,
	{
		readonly add: (name: string) => Effect.Effect<void, CounterError>
		readonly adjust: (id: string, amount: number, direction: 'add' | 'subtract') => Effect.Effect<void, CounterError>
		readonly changes: Stream.Stream<CounterSnapshot | CounterChanged>
		readonly remove: (id: string) => Effect.Effect<void, CounterError>
		readonly rename: (id: string, name: string) => Effect.Effect<void, CounterError>
		readonly snapshot: Effect.Effect<CounterState>
	}
>()('beer-counter/Counter') {}

export const makeCounter = Effect.gen(function* () {
	const state = yield* Ref.make(initialState())
	const changes = yield* PubSub.unbounded<CounterChanged>({replay: 1})
	const mutationLock = yield* Semaphore.make(1)

	const mutate = Effect.fn('Counter.mutate')(function* (
		change: (current: CounterState) => Effect.Effect<CounterState, CounterError>
	) {
		const current = yield* Ref.get(state)
		const next = yield* change(current)
		yield* Ref.set(state, next)
		yield* PubSub.publish(changes, CounterChanged.make({state: next}))
	})

	function serialized(change: (current: CounterState) => Effect.Effect<CounterState, CounterError>) {
		return pipe(mutate(change), Semaphore.withPermit(mutationLock))
	}

	return Counter.of({
		add: name =>
			serialized(current =>
				Effect.gen(function* () {
					const validName = yield* requireName(current, name)
					const createdOrder =
						Array.reduce(current.teams, -1, (maximum, team) => Math.max(maximum, team.createdOrder)) + 1
					return CounterState.make({
						teams: Array.append(
							current.teams,
							Team.make({count: 0, createdOrder, id: crypto.randomUUID(), name: validName})
						)
					})
				})
			),
		adjust: (id, amount, direction) =>
			serialized(current =>
				Effect.gen(function* () {
					if (!(Number.isInteger(amount) && amount > 0)) {
						return yield* validationError('Amount must be a positive whole number.')
					}
					const team = yield* requireTeam(current, id)
					const count = direction === 'add' ? team.count + amount : Math.max(0, team.count - amount)
					return CounterState.make({
						teams: Array.map(current.teams, candidate =>
							candidate.id === id ? Team.make({...candidate, count}) : candidate
						)
					})
				})
			),
		changes: pipe(
			Stream.fromEffect(
				pipe(
					Ref.get(state),
					Effect.map(snapshot => CounterSnapshot.make({state: snapshot}))
				)
			),
			Stream.concat(Stream.fromPubSub(changes))
		),
		remove: id =>
			serialized(current =>
				Effect.gen(function* () {
					yield* requireTeam(current, id)
					return CounterState.make({teams: Array.filter(current.teams, team => team.id !== id)})
				})
			),
		rename: (id, name) =>
			serialized(current =>
				Effect.gen(function* () {
					yield* requireTeam(current, id)
					const validName = yield* requireName(current, name, id)
					return CounterState.make({
						teams: Array.map(current.teams, team => (team.id === id ? Team.make({...team, name: validName}) : team))
					})
				})
			),
		snapshot: Ref.get(state)
	})
})

export const CounterLive = Layer.effect(Counter, makeCounter)
