import {
	Array,
	Context,
	Effect,
	FileSystem,
	HashMap,
	Layer,
	Option,
	Path,
	Predicate,
	Record,
	Schema,
	String,
	pipe
} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

const ScriptsPackageJson = Schema.Struct({
	deslop: Schema.optional(Schema.Struct({dev: Schema.optional(Schema.Array(Schema.String))})),
	name: Schema.optional(Schema.String),
	scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))
})

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
		const packageJsonPaths = yield* pipe(
			Effect.all(
				[
					Effect.succeed(['package.json']),
					pipe(
						fs.readDirectory(path.join(input.cwd, 'apps')),
						Effect.map(Array.map(entry => path.join('apps', entry, 'package.json'))),
						Effect.catch(() => Effect.succeed([]))
					),
					pipe(
						fs.readDirectory(path.join(input.cwd, 'packages')),
						Effect.map(Array.map(entry => path.join('packages', entry, 'package.json'))),
						Effect.catch(() => Effect.succeed([]))
					)
				],
				{concurrency: 3}
			),
			Effect.map(Array.flatten)
		)
		const manifests = yield* pipe(
			packageJsonPaths,
			Effect.forEach(packagePath =>
				pipe(
					fs.readFileString(path.join(input.cwd, packagePath)),
					Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ScriptsPackageJson))),
					Effect.map(packageJson => [{packageJson, packagePath}]),
					Effect.catch(() => Effect.succeed([]))
				)
			),
			Effect.map(Array.flatten)
		)
		const configuredDev = pipe(
			manifests,
			Array.findFirst(manifest => manifest.packagePath === 'package.json'),
			Option.map(manifest => manifest.packageJson.deslop?.dev ?? []),
			Option.getOrElse(() => Array.empty<string>())
		)
		const scripts = pipe(
			manifests,
			Array.reduce(HashMap.empty<string, ChildProcess.StandardCommand>(), (current, manifest) => {
				if (Predicate.isUndefined(manifest.packageJson.name)) return current
				return pipe(
					manifest.packageJson.scripts ?? {},
					Record.keys,
					Array.reduce(current, (next, scriptName) => {
						const taskId = `${manifest.packageJson.name}#${scriptName}`
						return HashMap.set(next, taskKey(taskId), command(input.cwd, taskId))
					})
				)
			})
		)
		const dev = pipe(
			configuredDev,
			Array.reduce(HashMap.empty<string, ChildProcess.StandardCommand>(), (current, taskId) =>
				HashMap.set(current, taskKey(taskId), command(input.cwd, taskId))
			)
		)

		return {dev, scripts}
	})
}) {
	public static layer = (input: {readonly cwd: string}) => Layer.effect(this, this.make(input))
}
