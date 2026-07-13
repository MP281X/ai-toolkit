/* oxlint-disable @deslop/oxlint-rules/no-function-return-type */
import type {Stream} from 'effect'
import {Array, Config, Context, Effect, Layer, Predicate, Schema, Semaphore, SubscriptionRef} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import {CommandError, type Team, TeamSnapshot} from '#rpcs/contracts.ts'

const defaults = Array.makeBy(12, index => ({
	count: 0,
	id: `team-${index < 9 ? '0' : ''}${index + 1}`,
	name: `Team ${index < 9 ? '0' : ''}${index + 1}`,
	order: index
}))

function commandError(message: string) {
	return new CommandError({message})
}
const encode = Effect.fn('TeamStore.encode')(function* (teams: readonly Team[]) {
	return yield* Effect.try({
		catch: () => commandError('Unable to save team data.'),
		try: () => Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(teams)
	})
})
const decode = Effect.fn('TeamStore.decode')(function* (value: string) {
	return yield* Effect.try({
		catch: () => commandError('Unable to load team data.'),
		try: () => Schema.decodeUnknownSync(TeamSnapshot)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(value))
	})
})

export class TeamStore extends Context.Service<
	TeamStore,
	{
		readonly add: (name: string) => Effect.Effect<readonly Team[], CommandError>
		readonly adjust: (id: string, amount: number) => Effect.Effect<readonly Team[], CommandError>
		readonly changes: Stream.Stream<readonly Team[]>
		readonly remove: (id: string) => Effect.Effect<readonly Team[], CommandError>
		readonly rename: (id: string, name: string) => Effect.Effect<readonly Team[], CommandError>
	}
>()('beer-counter/TeamStore') {
	static readonly layer = Layer.effect(
		TeamStore,
		Effect.gen(function* () {
			const kv = yield* KeyValueStore.KeyValueStore
			const saved = yield* kv.get('teams').pipe(Effect.mapError(() => commandError('Unable to load team data.')))
			const initial = Predicate.isUndefined(saved) ? defaults : yield* decode(saved)
			if (Predicate.isUndefined(saved)) {
				yield* encode(initial).pipe(
					Effect.flatMap(value => kv.set('teams', value)),
					Effect.mapError(() => commandError('Unable to save team data.'))
				)
			}
			const state = yield* SubscriptionRef.make(initial)
			const lock = yield* Semaphore.make(1)

			function mutate(change: (teams: readonly Team[]) => Effect.Effect<readonly Team[], CommandError>) {
				return lock.withPermits(1)(
					Effect.gen(function* () {
						const next = yield* change(yield* SubscriptionRef.get(state))
						yield* encode(next).pipe(
							Effect.flatMap(value => kv.set('teams', value)),
							Effect.mapError(() => commandError('Unable to save team data.'))
						)
						yield* SubscriptionRef.set(state, next)
						return next
					})
				)
			}
			const cleanName = Effect.fn('TeamStore.cleanName')(function* (
				name: string,
				teams: readonly Team[],
				ownId?: string
			): Effect.fn.Return<string, CommandError> {
				const clean = name.trim()
				if (clean.length === 0) return yield* commandError('Team name is required.')
				if (teams.some(team => team.id !== ownId && team.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
					return yield* commandError('Team names must be unique.')
				}
				return clean
			})

			return TeamStore.of({
				add: name =>
					mutate(teams =>
						cleanName(name, teams).pipe(
							Effect.map(clean => ({
								count: 0,
								id: crypto.randomUUID(),
								name: clean,
								order: teams.reduce((maximum, team) => Math.max(maximum, team.order), -1) + 1
							})),
							Effect.map(team => [...teams, team])
						)
					),
				adjust: (id, amount) =>
					mutate(teams => {
						if (!Number.isSafeInteger(amount) || amount === 0) {
							return Effect.fail(commandError('Enter a positive whole number.'))
						}
						if (!teams.some(team => team.id === id)) return Effect.fail(commandError('Team not found.'))
						return Effect.succeed(
							teams.map(team => (team.id === id ? {...team, count: Math.max(0, team.count + amount)} : team))
						)
					}),
				changes: SubscriptionRef.changes(state),
				remove: id =>
					mutate(teams =>
						teams.some(team => team.id === id)
							? Effect.succeed(teams.filter(team => team.id !== id))
							: Effect.fail(commandError('Team not found.'))
					),
				rename: (id, name) =>
					mutate(teams =>
						teams.some(team => team.id === id)
							? cleanName(name, teams, id).pipe(
									Effect.map(clean => teams.map(team => (team.id === id ? {...team, name: clean} : team)))
								)
							: Effect.fail(commandError('Team not found.'))
					)
			})
		})
	)
}

export const AdminPassword = Config.string('ADMIN_PASSWORD').pipe(Config.withDefault('beer-counter'))
