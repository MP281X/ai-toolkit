import {readFile} from 'node:fs/promises'

import {Array, Effect, Schema} from 'effect'

import {Plugin} from '@opencode-ai/plugin/effect'

type RootConfig = typeof RootConfig.Type
const RootConfig = Schema.fromJsonString(Schema.Struct({instructions: Schema.Array(Schema.String)}))

export default Plugin.define({
	effect: Effect.fnUntraced(function* (context) {
		yield* context.session.hook('context', event =>
			Effect.gen(function* () {
				const configPath = new URL('../opencode.json', import.meta.url)
				const root = new URL('../../', import.meta.url)
				const configText = yield* Effect.tryPromise(() => readFile(configPath, 'utf8'))
				const config = yield* Schema.decodeEffect(RootConfig)(configText)

				for (const file of config.instructions) {
					const text = yield* Effect.tryPromise(() => readFile(new URL(file, root), 'utf8'))
					if (!Array.some(event.system, part => part.text === text)) {
						event.system.push({text, type: 'text'})
					}
				}
			}).pipe(Effect.orDie)
		)
	}),
	id: 'deslop.instructions'
})
