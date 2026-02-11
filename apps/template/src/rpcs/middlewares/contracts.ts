import {RpcMiddleware} from '@effect/rpc'

import {OAuthError, Session} from '@ai-toolkit/oauth/server'

export class AuthMiddleware extends RpcMiddleware.Tag<AuthMiddleware>()('AuthMiddleware', {
	provides: Session,
	failure: OAuthError
}) {}
