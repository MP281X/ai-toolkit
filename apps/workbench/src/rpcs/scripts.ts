import {Array, Effect, FileSystem, Order, Path, Record, Schema} from 'effect'

import {ScriptRun} from '#rpcs/contracts.ts'

export const discoverPackageScripts = Effect.fnUntraced(function* (cwd: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const manifestPath = path.join(cwd, 'package.json')
	if (!(yield* fs.exists(manifestPath))) return []

	const manifest = yield* Effect.flatMap(
		fs.readFileString(manifestPath),
		Schema.decodeUnknownEffect(
			Schema.fromJsonString(Schema.Struct({scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))}))
		)
	)
	const scripts = Array.map(Record.toEntries(manifest.scripts ?? {}), ([scriptName, command]) =>
		ScriptRun.make({command, scriptName, sessionId: scriptName, taskId: scriptName})
	)

	return Array.sortWith(scripts, script => script.taskId, Order.String)
})
