import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2'
import { Config, Effect, pipe, Schema, Stream } from 'effect'

export class OpencodeError extends Schema.TaggedError<OpencodeError>()('OpencodeError', {
	cause: Schema.Defect
}) {}

export class OpencodeSdk extends Effect.Service<OpencodeSdk>()('@ai-toolkit/ai/OpencodeSdk', {
	scoped: Effect.gen(function* () {
		const client = createOpencodeClient({ baseUrl: yield* Config.string('OPENCODE_URL') })

		const events = pipe(
			Effect.tryPromise({
				try: () => client.event.subscribe(),
				catch: cause => new OpencodeError({ cause })
			}),
			Effect.andThen(({ stream }) => Stream.fromAsyncIterable(stream, cause => new OpencodeError({ cause }))),
			Stream.unwrap
		)

		type OpencodeResult<T> = { data: T; error?: undefined } | { data?: undefined; error: unknown }
		const use = Effect.fnUntraced(function* <T>(fn: (opencode: OpencodeClient) => Promise<OpencodeResult<T>>) {
			const result = yield* Effect.tryPromise({
				try: () => fn(client),
				catch: cause => new OpencodeError({ cause })
			})

			if (result.data) return result.data
			return yield* new OpencodeError({ cause: result.error })
		})

		return { events, use }
	})
}) {}
