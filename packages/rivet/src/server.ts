import {HttpServerRequest, HttpServerResponse} from '@effect/platform'
import {Effect, pipe, Schema} from 'effect'

import {type RegistryActors, setup} from 'rivetkit'

export class RivetError extends Schema.TaggedError<RivetError>()('RivetError', {
	cause: Schema.Defect
}) {}

export const makeRivetServer = Effect.fnUntraced(function* <T extends RegistryActors>(actors: T) {
	const server = setup({use: actors})

	return {
		server,
		handler: pipe(
			HttpServerRequest.HttpServerRequest,
			Effect.andThen(HttpServerRequest.toWeb),
			Effect.andThen(req =>
				Effect.tryPromise({
					try: () => server.handler(req),
					catch: cause => RivetError.make({cause})
				})
			),
			Effect.andThen(HttpServerResponse.fromWeb)
		)
	}
})

export {actor} from 'rivetkit'
