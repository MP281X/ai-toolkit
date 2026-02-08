import {Cookies, HttpRouter, HttpServerRequest, HttpServerResponse} from '@effect/platform'
import {Config, Effect, Predicate, Ref, Schema} from 'effect'

import {sha256} from '@oslojs/crypto/sha2'
import {encodeHexLowerCase} from '@oslojs/encoding'
import * as arctic from 'arctic'

export class GitHubUser extends Schema.Class<GitHubUser>('GitHubUser')({
	id: Schema.Number,
	login: Schema.String,
	name: Schema.NullOr(Schema.String),
	email: Schema.NullOr(Schema.String),
	avatar_url: Schema.String
}) {}

export class Session extends Schema.Class<Session>('Session')({
	token: Schema.String,
	userId: Schema.Number,
	user: GitHubUser,
	expiresAt: Schema.Number
}) {}

export class OAuthError extends Schema.TaggedError<OAuthError>()('OAuthError', {
	cause: Schema.Defect,
	message: Schema.String
}) {}

export class GitHubOAuth extends Effect.Service<GitHubOAuth>()('@oauth/GitHubOAuth', {
	accessors: true,
	effect: Effect.gen(function* () {
		const states = yield* Ref.make(new Map<string, number>())
		const sessions = yield* Ref.make(new Map<string, Session>())

		const github = new arctic.GitHub(
			yield* Config.string('AUTH_GITHUB_ID'),
			yield* Config.string('AUTH_GITHUB_SECRET'),
			yield* Config.string('AUTH_GITHUB_REDIRECT')
		)

		const createAuthorizationUrl = Effect.gen(function* () {
			const state = arctic.generateState()
			yield* Ref.update(states, store => new Map(store).set(state, Date.now() + 600_000))
			return github.createAuthorizationURL(state, ['user:email']).toString()
		})

		const validateCallback = Effect.fnUntraced(function* (code: string, state: string) {
			const now = Date.now()
			const store = yield* Ref.get(states)
			const expiry = store.get(state)
			if (Predicate.isNullable(expiry) || expiry < now) {
				return yield* OAuthError.make({cause: null, message: 'Invalid or expired OAuth state'})
			}
			yield* Ref.update(states, store => {
				const next = new Map(store)
				next.delete(state)
				return next
			})

			const tokens = yield* Effect.tryPromise({
				try: () => github.validateAuthorizationCode(code),
				catch: cause => OAuthError.make({cause, message: 'Failed to validate authorization code'})
			})

			const userResponse = yield* Effect.tryPromise({
				try: async () => {
					const response = await fetch('https://api.github.com/user', {
						headers: {Authorization: `Bearer ${tokens.accessToken()}`, 'User-Agent': 'ai-toolkit-oauth'}
					})
					return response.json()
				},
				catch: cause => OAuthError.make({cause, message: 'Failed to fetch GitHub user'})
			})

			const user = yield* Effect.mapError(Schema.decodeUnknown(GitHubUser)(userResponse), cause =>
				OAuthError.make({cause, message: 'Failed to parse GitHub user'})
			)

			const sessionToken = encodeHexLowerCase(sha256(new TextEncoder().encode(`${user.id}-${now}-${Math.random()}`)))
			const session = Session.make({
				token: sessionToken,
				userId: user.id,
				user,
				expiresAt: now + 86_400_000
			})

			yield* Ref.update(sessions, store => new Map(store).set(sessionToken, session))

			return session
		})

		const getSession = Effect.fnUntraced(function* (token: string) {
			const store = yield* Ref.get(sessions)
			const session = store.get(token)
			if (Predicate.isNullable(session) || session.expiresAt < Date.now()) return null
			return session
		})

		const deleteSession = Effect.fnUntraced(function* (token: string) {
			yield* Ref.update(sessions, store => {
				const next = new Map(store)
				next.delete(token)
				return next
			})
		})

		return {createAuthorizationUrl, validateCallback, getSession, deleteSession}
	})
}) {}

export const OAuthRoutes = Effect.gen(function* () {
	const oauth = yield* GitHubOAuth

	return HttpRouter.empty.pipe(
		HttpRouter.get(
			'/github',
			Effect.gen(function* () {
				return HttpServerResponse.redirect(yield* oauth.createAuthorizationUrl, {status: 302})
			})
		),
		HttpRouter.get(
			'/github/callback',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const url = new URL(request.url, 'http://localhost')
				const code = url.searchParams.get('code')
				const state = url.searchParams.get('state')

				if (!(code && state)) {
					return yield* HttpServerResponse.json({error: 'Missing code or state'}, {status: 400})
				}

				const session = yield* oauth.validateCallback(code, state)

				return HttpServerResponse.redirect('/', {
					status: 302,
					headers: {'Set-Cookie': `session=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`}
				})
			}).pipe(Effect.catchTag('OAuthError', error => HttpServerResponse.json({error: error.message}, {status: 401})))
		),
		HttpRouter.get(
			'/session',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const sessionToken = Cookies.parseHeader(request.headers['cookie'] ?? '')['session']

				if (Predicate.isNullable(sessionToken)) {
					return yield* HttpServerResponse.json({error: 'No session'}, {status: 401})
				}

				const session = yield* oauth.getSession(sessionToken)
				if (Predicate.isNullable(session)) {
					return yield* HttpServerResponse.json({error: 'Invalid session'}, {status: 401})
				}

				return yield* HttpServerResponse.json({user: session.user})
			})
		),
		HttpRouter.post(
			'/logout',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const sessionToken = Cookies.parseHeader(request.headers['cookie'] ?? '')['session']

				if (sessionToken) yield* oauth.deleteSession(sessionToken)

				return yield* HttpServerResponse.json(
					{ok: true},
					{
						status: 200,
						headers: {'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}
					}
				)
			})
		)
	)
})
