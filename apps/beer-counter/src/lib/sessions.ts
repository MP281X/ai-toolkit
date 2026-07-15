import {Config, Context, Effect, Layer, MutableHashSet, Option, Predicate, Schema, pipe} from 'effect'

import {Cookies} from 'effect/unstable/http'

import {CounterError} from '#rpcs/contracts.ts'

export const LoginCredentials = Schema.Struct({password: Schema.String, username: Schema.String})

function authError() {
	return new CounterError({message: 'Authentication required.', reason: 'auth'})
}

export class AdminSessions extends Context.Service<
	AdminSessions,
	{
		readonly authenticate: (credentials: typeof LoginCredentials.Type) => Effect.Effect<string, CounterError>
		readonly requireCookieHeader: (cookieHeader?: string) => Effect.Effect<void, CounterError>
		readonly valid: (token: string | undefined) => boolean
	}
>()('beer-counter/AdminSessions') {}

export function makeAdminSessions(adminPassword: string) {
	const sessions = MutableHashSet.empty<string>()

	function valid(token: string | undefined) {
		return Predicate.isNotUndefined(token) && MutableHashSet.has(sessions, token)
	}

	return AdminSessions.of({
		authenticate: credentials =>
			credentials.username === 'admin' && credentials.password === adminPassword
				? Effect.sync(() => {
						const token = crypto.randomUUID()
						MutableHashSet.add(sessions, token)
						return token
					})
				: Effect.fail(new CounterError({message: 'Invalid username or password.', reason: 'auth'})),
		requireCookieHeader: cookieHeader => {
			const token = pipe(
				Option.fromUndefinedOr(cookieHeader),
				Option.map(Cookies.parseHeader),
				Option.flatMap(cookies => Option.fromUndefinedOr(cookies['beer-counter-session'])),
				Option.getOrUndefined
			)
			return valid(token) ? Effect.void : Effect.fail(authError())
		},
		valid
	})
}

export const AdminSessionsLive = Layer.effect(
	AdminSessions,
	pipe(Config.string('ADMIN_PASSWORD'), Config.withDefault('beer-counter'), Effect.map(makeAdminSessions))
)
