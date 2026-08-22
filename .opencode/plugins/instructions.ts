import {NodeServices} from '@effect/platform-node'

import {Array, Effect, FileSystem, Path, Schema, pipe} from 'effect'

import {Plugin} from '@opencode-ai/plugin/effect'

type RootConfig = typeof RootConfig.Type
const RootConfig = Schema.fromJsonString(Schema.Struct({instructions: Schema.Array(Schema.String)}))

export default Plugin.define({
	effect: Effect.fnUntraced(function* (context) {
		const instructions = yield* pipe(
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const configPath = new URL('../opencode.json', import.meta.url).pathname
				const root = path.dirname(path.dirname(configPath))
				const config = yield* pipe(
					fs.readFileString(configPath),
					Effect.flatMap(Schema.decodeEffect(RootConfig))
				)
				return yield* Effect.forEach(config.instructions, file =>
					fs.readFileString(path.resolve(root, file))
				)
			}),
			Effect.provide(NodeServices.layer),
			Effect.orDie
		)
		yield* context.session.hook('context', event =>
			Effect.sync(() => {
				const native = pipe(
					instructions,
					Array.filter(text => !Array.some(event.system, part => part.text === text)),
					Array.map(text => ({text, type: 'text' as const}))
				)
				event.system = [...event.system, ...native]
			})
		)
	}),
	id: 'deslop.instructions'
})
