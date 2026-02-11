import {Effect, Layer, pipe} from 'effect'

import {OAuth, Session} from '@ai-toolkit/oauth/server'

import {AuthMiddleware} from './contracts.ts'

export const AuthMiddlewareHandler = Layer.effect(
	AuthMiddleware,
	pipe(
		OAuth,
		Effect.andThen(oauth =>
			AuthMiddleware.of(
				Effect.fnUntraced(function* ({headers}) {
					const session = yield* oauth.session(headers)
					return Session.of(session)
				})
			)
		)
	)
)
