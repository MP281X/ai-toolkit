import {Array, Config, Effect, Option, String, SubscriptionRef, SynchronizedRef, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import {BeerCounterState, CommandError, RpcContracts, Team} from '#rpcs/contracts.ts'

const initialState = BeerCounterState.make({
	teams: Array.makeBy(12, index =>
		Team.make({
			count: 0,
			createdAt: index,
			id: `team-${pipe(`${index + 1}`, String.padStart(2, '0'))}`,
			name: `Team ${pipe(`${index + 1}`, String.padStart(2, '0'))}`
		})
	)
})

function validateName(current: BeerCounterState, name: string, ignoredId?: string) {
	const cleaned = pipe(name, String.trim)
	if (String.isEmpty(cleaned)) return new CommandError({message: 'Enter a team name.'})
	if (
		Array.some(
			current.teams,
			team => team.id !== ignoredId && String.toLowerCase(team.name) === String.toLowerCase(cleaned)
		)
	) {
		return new CommandError({message: 'Team names must be unique.'})
	}
	return cleaned
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const password = yield* Config.string('ADMIN_PASSWORD').pipe(Config.withDefault('beer-counter'))
		const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, BeerCounterState)
		const persisted = yield* store.get('beer-counter-state')
		const loaded = Option.getOrElse(persisted, () => initialState)
		const state = yield* SubscriptionRef.make(loaded)
		const serializedState = yield* SynchronizedRef.make(loaded)
		if (Option.isNone(persisted)) yield* store.set('beer-counter-state', initialState)

		function authenticate(credentials: {readonly password: string; readonly username: string}) {
			return credentials.username === 'admin' && credentials.password === password
				? Effect.void
				: new CommandError({message: 'Invalid username or password.'})
		}

		const mutate = Effect.fn('BeerCounter.mutate')(function* (
			credentials: {readonly password: string; readonly username: string},
			change: (current: BeerCounterState) => BeerCounterState | CommandError
		) {
			yield* authenticate(credentials)
			const next = yield* SynchronizedRef.modifyEffect(serializedState, current => {
				const changed = change(current)
				if (changed instanceof CommandError) return Effect.fail(changed)
				return store.set('beer-counter-state', changed).pipe(
					Effect.mapError(() => new CommandError({message: 'Could not save the change.'})),
					Effect.as([changed, changed] as const)
				)
			})
			yield* SubscriptionRef.set(state, next)
			return next
		})

		return RpcContracts.of({
			'admin.authenticate': authenticate,
			'scoreboard.watch': () => SubscriptionRef.changes(state),
			'teams.add': payload =>
				mutate(payload, current => {
					const name = validateName(current, payload.name)
					if (name instanceof CommandError) return name
					const createdAt = Array.reduce(current.teams, -1, (maximum, team) => Math.max(maximum, team.createdAt)) + 1
					return BeerCounterState.make({
						teams: Array.append(current.teams, Team.make({count: 0, createdAt, id: crypto.randomUUID(), name}))
					})
				}),
			'teams.adjust': payload =>
				mutate(payload, current => {
					const team = pipe(
						current.teams,
						Array.findFirst(candidate => candidate.id === payload.id),
						Option.getOrUndefined
					)
					if (!team) return new CommandError({message: 'Team no longer exists.'})
					const count = payload.direction === 'add' ? team.count + payload.amount : team.count - payload.amount
					if (count < 0) return new CommandError({message: 'A count cannot be negative.'})
					return BeerCounterState.make({
						teams: Array.map(current.teams, candidate =>
							candidate.id === team.id ? Team.make({...candidate, count}) : candidate
						)
					})
				}),
			'teams.remove': payload =>
				mutate(payload, current => {
					if (!Array.some(current.teams, team => team.id === payload.id)) {
						return new CommandError({message: 'Team no longer exists.'})
					}
					return BeerCounterState.make({teams: Array.filter(current.teams, team => team.id !== payload.id)})
				}),
			'teams.rename': payload =>
				mutate(payload, current => {
					if (!Array.some(current.teams, team => team.id === payload.id)) {
						return new CommandError({message: 'Team no longer exists.'})
					}
					const name = validateName(current, payload.name, payload.id)
					if (name instanceof CommandError) return name
					return BeerCounterState.make({
						teams: Array.map(current.teams, team => (team.id === payload.id ? Team.make({...team, name}) : team))
					})
				})
		})
	})
)
