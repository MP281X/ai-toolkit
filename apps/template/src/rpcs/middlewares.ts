import {RpcMiddleware} from '@effect/rpc'
import {Effect, Layer, pipe} from 'effect'

import {OAuth, OAuthError, Session} from '@ai-toolkit/oauth/server'

export class AuthMiddleware extends RpcMiddleware.Tag<AuthMiddleware>()('AuthMiddleware', {
	provides: Session,
	failure: OAuthError
}) {}

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
