import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {Effect, Option, pipe} from 'effect'

export class JsonStore extends Effect.Service<JsonStore>()('@ai-toolkit/storage/JsonStore', {
	effect: Effect.gen(function* () {
		const keyValueStore = yield* KeyValueStore.KeyValueStore

		const read = <A>(key: string, decoder: (input: unknown) => A, fallback: A) =>
			pipe(
				keyValueStore.get(key),
				Effect.map(option =>
					Option.match(option, {
						onNone: () => fallback,
						onSome: value => decoder(JSON.parse(value))
					})
				)
			)

		const write = (key: string, value: unknown) => keyValueStore.set(key, JSON.stringify(value))

		return {read, write}
	})
}) {}
