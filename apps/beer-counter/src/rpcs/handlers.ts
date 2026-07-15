import {Effect, Layer} from 'effect'

import {AdminAuth} from '#lib/adminAuth.ts'
import {Counter} from '#lib/counter.ts'
import {AdminAuthorization, RpcContracts} from '#rpcs/contracts.ts'

export const AdminAuthorizationLive = Layer.effect(
	AdminAuthorization,
	Effect.gen(function* () {
		const auth = yield* AdminAuth
		return AdminAuthorization.of((effect, options) =>
			Effect.andThen(auth.requireCookieHeader(options.headers['cookie']), effect)
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
			'auth.status': () => Effect.void,
			'counter.watch': () => counter.changes
		})
	})
)
