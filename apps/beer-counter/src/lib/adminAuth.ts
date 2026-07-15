import {Config, Context, Effect, Layer, Option, Redacted, pipe} from 'effect'

import {Cookies} from 'effect/unstable/http'

import {CounterError} from '#rpcs/contracts.ts'

function authError() {
	return new CounterError({message: 'Authentication required.', reason: 'auth'})
}

export class AdminAuth extends Context.Service<
	AdminAuth,
	{
		readonly requireCookieHeader: (cookieHeader?: string) => Effect.Effect<void, CounterError>
		readonly requireToken: (token: string) => Effect.Effect<void, CounterError>
	}
>()('beer-counter/AdminAuth') {}

export function makeAdminAuth(expectedToken: string) {
	function requireToken(token: string) {
		return token === expectedToken ? Effect.void : Effect.fail(authError())
	}

	return AdminAuth.of({
		requireCookieHeader: cookieHeader =>
			pipe(
				Option.fromUndefinedOr(cookieHeader),
				Option.map(Cookies.parseHeader),
				Option.flatMap(cookies => Option.fromUndefinedOr(cookies['beer-counter-admin-token'])),
				Option.match({onNone: () => Effect.fail(authError()), onSome: requireToken})
			),
		requireToken
	})
}

export const AdminAuthLive = Layer.effect(
	AdminAuth,
	pipe(Config.redacted('ADMIN_TOKEN'), Effect.map(Redacted.value), Effect.map(makeAdminAuth))
)
