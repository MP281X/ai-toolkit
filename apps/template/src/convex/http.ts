import {Chunk, Effect, pipe, Stream} from 'effect'

import {AccumulateTextStream, AiSdk, StreamToResponse} from '@ai-toolkit/ai'
import {httpRouter} from 'convex/server'

import {httpAction} from '#convex/server.js'
import {ServerRuntime} from '#lib/serverRuntime.ts'

const http = httpRouter()

http.route({
	path: '/llm',
	method: 'GET',
	handler: httpAction(
		Effect.fnUntraced(function* () {
			const stream = yield* pipe(
				AiSdk.stream(),
				Effect.andThen(s => Stream.share(s, {capacity: 2}))
			)

			yield* pipe(
				stream,
				AccumulateTextStream,
				Stream.runCollect,
				Effect.andThen(Chunk.last),
				// save to the db
				Effect.tap(Effect.log),
				Effect.forkScoped
			)

			return yield* StreamToResponse(stream)
		}, ServerRuntime.runPromise)
	)
})

export default http
