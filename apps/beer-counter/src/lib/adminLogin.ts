import {Config, Effect, Layer, Schema, pipe} from 'effect'

import {HttpRouter, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'

import {AdminAuth} from '#lib/adminAuth.ts'

const LoginInput = Schema.Struct({token: Schema.String})

export const AdminLoginRoute = Layer.effectDiscard(
	Effect.gen(function* () {
		const auth = yield* AdminAuth
		const router = yield* HttpRouter.HttpRouter
		const environment = yield* pipe(Config.string('NODE_ENV'), Config.withDefault('development'))
		const cookieOptions = {
			httpOnly: true,
			path: '/',
			sameSite: 'strict',
			secure: environment !== 'development'
		} as const

		yield* router.add(
			'POST',
			'/api/admin/login',
			Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest
				const input = yield* pipe(request.json, Effect.flatMap(Schema.decodeUnknownEffect(LoginInput)))
				yield* auth.requireToken(input.token)

				return yield* HttpServerResponse.setCookie(
					HttpServerResponse.empty(),
					'beer-counter-admin-token',
					input.token,
					cookieOptions
				)
			}).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.empty({status: 401}))))
		)

		yield* router.add(
			'POST',
			'/api/admin/logout',
			HttpServerResponse.expireCookie(HttpServerResponse.empty(), 'beer-counter-admin-token', cookieOptions)
		)
	})
)
