import {Effect, Layer, pipe} from 'effect'

import {OAuth, Session} from '@ai-toolkit/oauth/server'

import {AuthMiddleware} from './contracts.ts'

export const AuthMiddlewareLive = Layer.effect(
	AuthMiddleware,
	pipe(
		OAuth,
		Effect.andThen(oAuth =>
			AuthMiddleware.of(
				Effect.fnUntraced(function* ({headers}) {
					const session = yield* oAuth.session(headers)
					return Session.of(session)
				})
			)
		)
	)
)
