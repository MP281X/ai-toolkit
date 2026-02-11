import {type Headers, HttpServerRequest, HttpServerResponse} from '@effect/platform'
import {Config, Context, Effect, Predicate, pipe, Schema} from 'effect'

import {betterAuth} from 'better-auth/minimal'

export class OAuthError extends Schema.TaggedError<OAuthError>()('OAuthError', {
	cause: Schema.Defect
}) {}

export class OAuth extends Effect.Service<OAuth>()('@ai-toolkit/oauth/OAuth', {
	accessors: true,
	effect: Effect.gen(function* () {
		const auth = betterAuth({
			baseURL: `${yield* Config.string('VITE_SERVER_URL')}/api/auth`,
			trustedOrigins: [yield* Config.string('VITE_CLIENT_URL')],
			socialProviders: {
				github: {
					clientId: yield* Config.string('AUTH_GITHUB_ID'),
					clientSecret: yield* Config.string('AUTH_GITHUB_SECRET')
				}
			}
		})

		const use = Effect.fnUntraced(function* <T>(fn: (betterAuth: typeof auth.api) => Promise<T>) {
			const result = yield* Effect.tryPromise({
				try: () => fn(auth.api),
				catch: cause => new OAuthError({cause})
			})

			if (Predicate.isNotNullable(result)) return result
			return yield* new OAuthError({cause: 'Unknown Error'})
		})

		return {
			session: (headers: Headers.Headers) => use(client => client.getSession({headers})),
			handler: pipe(
				HttpServerRequest.HttpServerRequest,
				Effect.andThen(HttpServerRequest.toWeb),
				Effect.andThen(req =>
					Effect.tryPromise({
						try: () => auth.handler(req),
						catch: cause => OAuthError.make({cause})
					})
				),
				Effect.andThen(HttpServerResponse.fromWeb)
			)
		}
	})
}) {}

export class Session extends Context.Tag('@ai-toolkit/oauth/Session')<
	Session,
	Effect.Effect.Success<ReturnType<OAuth['session']>>
>() {}
