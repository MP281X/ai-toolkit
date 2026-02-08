import {HttpServerRequest, HttpServerResponse} from '@effect/platform'
import {Config, Effect, pipe, Schema} from 'effect'

import {betterAuth} from 'better-auth/minimal'

export class OAuthError extends Schema.TaggedError<OAuthError>()('OAuthError', {
	cause: Schema.Defect
}) {}

export class OAuth extends Effect.Service<OAuth>()('@oauth/GitHubOAuth', {
	accessors: true,
	effect: Effect.gen(function* () {
		yield* Effect.log('init')
		const auth = betterAuth({
			baseURL: yield* Config.string('VITE_AUTH_BASE_URL'),
			socialProviders: {
				github: {
					clientId: yield* Config.string('AUTH_GITHUB_ID'),
					clientSecret: yield* Config.string('AUTH_GITHUB_SECRET')
				}
			}
		})

		return {
			handler: pipe(
				HttpServerRequest.HttpServerRequest,
				Effect.andThen(HttpServerRequest.toWeb),
				Effect.andThen(req =>
					Effect.tryPromise({
						try: () => auth.handler(req),
						catch: cause => OAuthError.make({cause})
					})
				),
				Effect.andThen(HttpServerResponse.fromWeb)
			)
		}
	})
}) {}
