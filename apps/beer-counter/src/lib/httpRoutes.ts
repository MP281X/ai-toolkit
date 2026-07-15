import {Config, Effect, Layer, Schema, pipe} from 'effect'

import {HttpRouter, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'

import {AdminSessions, LoginCredentials} from '#lib/sessions.ts'

const unauthorized = HttpServerResponse.empty({status: 401})

export const AdminSessionRoutes = Layer.effectDiscard(
	Effect.gen(function* () {
		const sessions = yield* AdminSessions
		const router = yield* HttpRouter.HttpRouter
		const environment = yield* pipe(Config.string('NODE_ENV'), Config.withDefault('development'))

		yield* router.add('GET', '/api/admin/session', request =>
			Effect.succeed(
				sessions.valid(request.cookies['beer-counter-session']) ? HttpServerResponse.empty() : unauthorized
			)
		)

		yield* router.add(
			'POST',
			'/api/admin/session',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const credentials = yield* pipe(request.json, Effect.flatMap(Schema.decodeUnknownEffect(LoginCredentials)))
				const token = yield* sessions.authenticate(credentials)

				return HttpServerResponse.setCookieUnsafe(HttpServerResponse.empty(), 'beer-counter-session', token, {
					httpOnly: true,
					path: '/',
					sameSite: 'strict',
					secure: environment !== 'development'
				})
			}).pipe(Effect.catch(() => Effect.succeed(unauthorized)))
		)
	})
)
