import {Context, Crypto, Effect, Layer, Option, Predicate, Redacted, Ref, Schema, pipe} from 'effect'

import {HttpClient, HttpClientRequest, HttpRouter, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'

import {OAuthError, OAuthSession} from './schema.ts'

const AccessTokenResponse = Schema.Struct({access_token: Schema.String})
const GitHubUser = Schema.Struct({id: Schema.Finite, login: Schema.String})

type OAuthConfig = {readonly clientId: string; readonly clientSecret: Redacted.Redacted; readonly allowedUserId: string}

type ActiveSession = {readonly cookie: string; readonly session: typeof OAuthSession.Type; readonly token: string}

function oauthError(message: string, cause?: unknown) {
	return Predicate.isUndefined(cause) ? OAuthError.make({message}) : OAuthError.make({cause, message})
}

export class OAuth extends Context.Service<OAuth>()('@deslop/oauth/service/OAuth', {
	make: Effect.fnUntraced(function* (config: OAuthConfig) {
		const crypto = yield* Crypto.Crypto
		const client = yield* HttpClient.HttpClient
		const router = yield* HttpRouter.HttpRouter
		const state = yield* Ref.make<Option.Option<string>>(Option.none())
		const active = yield* Ref.make<Option.Option<ActiveSession>>(Option.none())

		const current = Effect.fnUntraced(function* () {
			return yield* pipe(
				Ref.get(active),
				Effect.flatMap(Option.match({onNone: () => oauthError('authentication required'), onSome: Effect.succeed}))
			)
		})

		yield* router.add(
			'GET',
			'/auth/login',
			Effect.gen(function* () {
				const nextState = yield* crypto.randomUUIDv4
				yield* Ref.set(state, Option.some(nextState))
				const url = new URL('https://github.com/login/oauth/authorize')
				url.searchParams.set('client_id', config.clientId)
				url.searchParams.set('scope', 'repo')
				url.searchParams.set('state', nextState)
				return HttpServerResponse.redirect(url)
			}).pipe(Effect.orDie)
		)

		yield* router.add(
			'GET',
			'/auth/callback',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const url = new URL(request.url, 'http://localhost')
				const code = url.searchParams.get('code')
				const returnedState = url.searchParams.get('state')
				const expectedState = yield* Ref.getAndSet(state, Option.none())
				if (
					code === null ||
					returnedState === null ||
					Option.isNone(expectedState) ||
					expectedState.value !== returnedState
				) {
					return yield* oauthError('invalid OAuth callback')
				}

				const tokenResponse = yield* pipe(
					HttpClientRequest.post('https://github.com/login/oauth/access_token'),
					HttpClientRequest.acceptJson,
					HttpClientRequest.bodyJson({
						client_id: config.clientId,
						client_secret: Redacted.value(config.clientSecret),
						code
					}),
					Effect.flatMap(client.execute),
					Effect.flatMap(response => response.json),
					Effect.flatMap(Schema.decodeUnknownEffect(AccessTokenResponse)),
					Effect.mapError(cause => oauthError('failed to exchange OAuth code', cause))
				)
				const user = yield* pipe(
					client.get('https://api.github.com/user', {
						headers: {accept: 'application/vnd.github+json', authorization: `Bearer ${tokenResponse.access_token}`}
					}),
					Effect.flatMap(response => response.json),
					Effect.flatMap(Schema.decodeUnknownEffect(GitHubUser)),
					Effect.mapError(cause => oauthError('failed to load GitHub identity', cause))
				)
				if (`${user.id}` !== config.allowedUserId) return yield* oauthError('GitHub user is not authorized')

				const cookie = yield* crypto.randomUUIDv4
				yield* Ref.set(
					active,
					Option.some({
						cookie,
						session: OAuthSession.make({login: user.login, userId: `${user.id}`}),
						token: tokenResponse.access_token
					})
				)
				return pipe(
					HttpServerResponse.redirect('/'),
					HttpServerResponse.setCookieUnsafe('deslop_session', cookie, {httpOnly: true, path: '/', sameSite: 'lax'})
				)
			}).pipe(Effect.catch(error => Effect.succeed(HttpServerResponse.text(error.message, {status: 401}))))
		)

		yield* router.add(
			'POST',
			'/auth/logout',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const session = yield* Ref.get(active)
				if (Option.isNone(session) || request.cookies['deslop_session'] !== session.value.cookie) {
					return HttpServerResponse.text('authentication required', {status: 401})
				}
				yield* Ref.set(active, Option.none())
				return pipe(
					HttpServerResponse.redirect('/auth/login'),
					HttpServerResponse.expireCookieUnsafe('deslop_session', {path: '/'})
				)
			})
		)

		yield* router.addGlobalMiddleware(effect =>
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				if (request.url.startsWith('/auth/') || request.url.startsWith('/assets/')) {
					return yield* effect
				}
				const session = yield* Ref.get(active)
				return Option.isSome(session) && request.cookies['deslop_session'] === session.value.cookie
					? yield* effect
					: HttpServerResponse.redirect('/auth/login')
			})
		)

		return {
			http: router,
			session: pipe(
				current(),
				Effect.map(value => value.session)
			),
			token: pipe(
				current(),
				Effect.map(value => value.token)
			)
		}
	})
}) {
	public static layer = (config: OAuthConfig) => Layer.effect(this, this.make(config))
}
