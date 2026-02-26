import {OAuthError, type Session} from '@ai-toolkit/oauth/server'
import {RpcMiddleware} from 'effect/unstable/rpc'

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {provides: Session}>()('AuthMiddleware', {
	error: OAuthError,
	requiredForClient: false
}) {}
