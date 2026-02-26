import {Effect, Layer, pipe} from 'effect'

import {OAuth, Session} from '@ai-toolkit/oauth/server'

import {AuthMiddleware} from './contracts.ts'

export const AuthMiddlewareHandler = Layer.effect(
	AuthMiddleware,
	Effect.map(OAuth.asEffect(), oauth =>
		AuthMiddleware.of((effect, options) =>
			pipe(
				oauth.session(options.headers),
				Effect.flatMap(session => Effect.provideService(effect, Session, session))
			)
		)
	)
)
