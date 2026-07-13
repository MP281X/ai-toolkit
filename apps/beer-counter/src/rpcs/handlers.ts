import {Effect, Stream} from 'effect'

import {AdminPassword, TeamStore} from '#lib/teamStore.ts'
import {CommandError, RpcContracts} from '#rpcs/contracts.ts'

const authenticate = Effect.fn('authenticate')(function* (payload: {
	readonly password: string
	readonly username: string
}) {
	const password = yield* AdminPassword.pipe(Effect.orDie)
	if (payload.username !== 'admin' || payload.password !== password) {
		return yield* new CommandError({message: 'Invalid username or password.'})
	}
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const teams = yield* TeamStore
		return RpcContracts.of({
			teams: () => teams.changes.pipe(Stream.orDie),
			'teams.add': payload => authenticate(payload).pipe(Effect.andThen(teams.add(payload.name))),
			'teams.adjust': payload => authenticate(payload).pipe(Effect.andThen(teams.adjust(payload.id, payload.amount))),
			'teams.remove': payload => authenticate(payload).pipe(Effect.andThen(teams.remove(payload.id))),
			'teams.rename': payload => authenticate(payload).pipe(Effect.andThen(teams.rename(payload.id, payload.name)))
		})
	})
)
