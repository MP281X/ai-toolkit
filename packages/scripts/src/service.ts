import {Array, Context, Effect, FileSystem, HashMap, Layer, Path, Record, Schema, String, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

const ScriptsPackageJson = Schema.Struct({
	deslop: Schema.optional(Schema.Struct({dev: Schema.optional(Schema.Array(Schema.String))})),
	scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))
})

const EmptyScriptsPackageJson = {deslop: {dev: Array.empty<string>()}, scripts: {}}

function taskKey(taskId: string) {
	if (!String.startsWith('@')(taskId)) return taskId
	const slash = taskId.indexOf('/')
	return slash < 0 ? String.slice(1)(taskId) : String.slice(slash + 1)(taskId)
}

function command(cwd: string, taskId: string) {
	return ChildProcess.make('vp', ['run', taskId], {cwd})
}

export class Scripts extends Context.Service<Scripts>()('@deslop/scripts/service/Scripts', {
	make: Effect.fnUntraced(function* (input: {readonly cwd: string}) {
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const packageJson = yield* pipe(
			fs.readFileString(path.join(input.cwd, 'package.json')),
			Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ScriptsPackageJson))),
			Effect.catch(() => Effect.succeed(EmptyScriptsPackageJson))
		)
		const scripts = pipe(
			packageJson.scripts ?? {},
			Record.keys,
			Array.reduce(HashMap.empty<string, ChildProcess.StandardCommand>(), (current, scriptName) =>
				HashMap.set(current, scriptName, command(input.cwd, scriptName))
			)
		)
		const dev = pipe(
			packageJson.deslop?.dev ?? Array.empty<string>(),
			Array.reduce(HashMap.empty<string, ChildProcess.StandardCommand>(), (current, taskId) =>
				HashMap.set(current, taskKey(taskId), command(input.cwd, taskId))
			)
		)

		return {dev, scripts}
	})
}) {
	public static layer = (input: {readonly cwd: string}) => Layer.effect(this, this.make(input))
}
