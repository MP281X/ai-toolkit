import {NodeServices} from '@effect/platform-node'

import {Array, Effect, FileSystem, Layer, Path, Schema, pipe} from 'effect'

import {Plugin} from '@opencode-ai/plugin/effect'

type InstructionConfig = typeof InstructionConfig.Type
const InstructionConfig = Schema.Struct({instructions: Schema.Array(Schema.String)})

export default Plugin.define({
	effect: context =>
		pipe(
			Effect.gen(function* () {
				const services = yield* Layer.build(NodeServices.layer)
				yield* Effect.provide(
					Effect.gen(function* () {
						const fs = yield* FileSystem.FileSystem
						const path = yield* Path.Path
						const configPath = new URL('./opencode.json', import.meta.url).pathname
						const decoded: InstructionConfig = yield* Schema.decodeUnknownEffect(InstructionConfig)(context.options)
						const instructions = yield* Effect.forEach(decoded.instructions, file =>
							fs.readFileString(path.resolve(path.dirname(configPath), file))
						)
						const text = pipe(instructions, Array.join('\n\n'))
						yield* context.session.hook('context', event =>
							Effect.sync(() => {
								if (!Array.some(event.system, part => part.text === text)) {
									event.system = [...event.system, {text, type: 'text'}]
								}
							})
						)
					}),
					services
				)
			}),
			Effect.orDie
		),
	id: 'deslop.instructions'
})
