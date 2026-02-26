import {Config, Duration, Effect, Layer, Predicate, pipe, Schema, ServiceMap} from 'effect'

import {betterAuth} from 'better-auth/minimal'
import type {Headers} from 'effect/unstable/http'

export class OAuthError extends Schema.TaggedErrorClass<OAuthError>()('OAuthError', {
	cause: Schema.Defect
}) {}

export class OAuth extends ServiceMap.Service<OAuth>()('@ai-toolkit/oauth/OAuth', {
	make: Effect.gen(function* () {
		const auth = betterAuth({
			secret: yield* Config.string('AUTH_SECRET'),
			baseURL: `${yield* Config.string('BASE_URL')}/api/auth`,
			socialProviders: {
				github: {
					clientId: yield* Config.string('AUTH_GITHUB_ID'),
					clientSecret: yield* Config.string('AUTH_GITHUB_SECRET')
				}
			},
			session: {
				expiresIn: pipe(Duration.days(7), Duration.toSeconds),
				updateAge: pipe(Duration.hours(6), Duration.toSeconds),
				cookieCache: {
					enabled: true,
					strategy: 'compact',
					maxAge: pipe(Duration.minutes(5), Duration.toSeconds)
				}
			}
		})

		const use = Effect.fnUntraced(function* <T>(fn: (betterAuth: typeof auth.api) => Promise<T>) {
			const result = yield* Effect.tryPromise({
				try: () => fn(auth.api),
				catch: cause => new OAuthError({cause})
			})

			if (Predicate.isNotNullish(result)) return result
			return yield* new OAuthError({cause: 'Unknown Error'})
		})

		return {
			session: (headers: Headers.Headers) => use(client => client.getSession({headers})),
			handler: auth.handler
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
	static handler = (request: Request) => this.use(oauth => Effect.promise(() => oauth.handler(request)))
}

export class Session extends ServiceMap.Service<Session, Effect.Success<ReturnType<OAuth['Service']['session']>>>()(
	'@ai-toolkit/oauth/Session'
) {}
