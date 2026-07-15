import {Effect, Layer} from 'effect'

import {Counter} from '#lib/counter.ts'
import {AdminSessions} from '#lib/sessions.ts'
import {AdminSession, RpcContracts} from '#rpcs/contracts.ts'

export const AdminSessionLive = Layer.effect(
	AdminSession,
	Effect.gen(function* () {
		const sessions = yield* AdminSessions
		return AdminSession.of((effect, options) =>
			Effect.andThen(sessions.requireCookieHeader(options.headers['cookie']), effect)
		)
	})
)

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const counter = yield* Counter

		return RpcContracts.of({
			'admin.add': payload => counter.add(payload.name),
			'admin.adjust': payload => counter.adjust(payload.id, payload.amount, payload.direction),
			'admin.remove': payload => counter.remove(payload.id),
			'admin.rename': payload => counter.rename(payload.id, payload.name),
			'counter.watch': () => counter.changes
		})
	})
)
