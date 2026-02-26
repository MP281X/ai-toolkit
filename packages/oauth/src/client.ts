import {Effect, Layer, Predicate, pipe, Schema, ServiceMap} from 'effect'

import {createAuthClient} from 'better-auth/client'

export class OAuthError extends Schema.TaggedErrorClass<OAuthError>()('OAuthError', {
	cause: Schema.Defect
}) {}

type BetterAuthResult<T> = {data: T; error: null} | {data: null; error: unknown}

export class OAuth extends ServiceMap.Service<OAuth>()('@ai-toolkit/oauth/OAuth', {
	make: Effect.gen(function* () {
		const client = createAuthClient({baseURL: `${window.origin}/api/auth`})

		const use = Effect.fnUntraced(function* <T>(fn: (betterAuth: typeof client) => Promise<BetterAuthResult<T>>) {
			const result = yield* Effect.tryPromise({
				try: () => fn(client),
				catch: cause => new OAuthError({cause})
			})

			if (Predicate.isNotNull(result.data)) return result.data
			return yield* new OAuthError({cause: result.error})
		})

		return {
			signIn: pipe(
				use(client => client.signIn.social({provider: 'github', callbackURL: window.origin})),
				Effect.flatMap(() => Effect.never)
			),
			signOut: use(client => client.signOut()),
			session: use(client => client.getSession())
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
	static signIn = this.use(oauth => oauth.signIn)
	static signOut = this.use(oauth => oauth.signOut)
	static session = this.use(oauth => oauth.session)
}
