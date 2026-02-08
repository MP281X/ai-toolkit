import {Effect, Predicate, Schema} from 'effect'

import {createAuthClient} from 'better-auth/client'

export class OAuthError extends Schema.TaggedError<OAuthError>()('OAuthError', {
	cause: Schema.Defect
}) {}

type BetterAuthResult<T> = {data: T; error: null} | {data: null; error: unknown}

export class OAuth extends Effect.Service<OAuth>()('@ai-toolkit/oauth/OAuth', {
	accessors: true,
	effect: Effect.gen(function* () {
		const client = createAuthClient({baseURL: `${window.location.origin}/api/auth`})

		const use = Effect.fnUntraced(function* <T>(fn: (betterAuth: typeof client) => Promise<BetterAuthResult<T>>) {
			const result = yield* Effect.tryPromise({
				try: () => fn(client),
				catch: cause => new OAuthError({cause})
			})

			if (Predicate.isNotNullable(result.data)) return result.data
			return yield* new OAuthError({cause: result.error})
		})

		return {
			signIn: use(client => client.signIn.social({provider: 'github'})),
			signOut: use(client => client.signOut()),
			session: use(client => client.getSession())
		}
	})
}) {}
