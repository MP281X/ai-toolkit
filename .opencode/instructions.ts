import {NodeServices} from '@effect/platform-node'

import {Array, Effect, FileSystem, Path, Schema, pipe} from 'effect'

import {Plugin} from '@opencode-ai/plugin/effect'

const InstructionConfig = Schema.Struct({instructions: Schema.Array(Schema.String)})

export default Plugin.define({
	effect: context =>
		pipe(
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const configPath = new URL('./opencode.json', import.meta.url).pathname
				const decoded = yield* Schema.decodeUnknownEffect(InstructionConfig)(context.options)
				const instructions = yield* Effect.forEach(decoded.instructions, file =>
					fs.readFileString(path.resolve(path.dirname(configPath), file))
				)
				const text = pipe(instructions, Array.join('\n\n'))
				yield* context.session.hook('context', event =>
					Effect.sync(() => {
						event.system = [...event.system, {text, type: 'text'}]
					})
				)
			}),
			Effect.provide(NodeServices.layer),
			Effect.orDie
		),
	id: 'deslop.instructions'
})
