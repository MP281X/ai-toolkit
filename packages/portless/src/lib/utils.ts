import {Array, Effect, FileSystem, Hash, Option, Order, Path, Schema, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

function packageJson(source: string) {
	return pipe(
		source,
		Schema.decodeUnknownEffect(
			Schema.fromJsonString(
				Schema.Struct({
					deslop: Schema.optional(Schema.Struct({portless: Schema.optional(Schema.Array(Schema.String))})),
					name: Schema.optional(Schema.String),
					scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))
				})
			)
		),
		Effect.map(value => ({
			deslop: {portless: value.deslop?.portless ?? []},
			name: value.name,
			scripts: value.scripts ?? {}
		}))
	)
}

function hostSegment(value: string) {
	const segment = pipe(
		value,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9-]+/gu, '-'),
		String.replaceAll(/^-+|-+$/gu, '')
	)
	return String.isEmpty(segment) ? 'app' : segment
}

function scriptHostSegment(value: string) {
	return hostSegment(String.startsWith('dev:')(value) ? String.slice(4)(value) : value)
}

function worktreeHostSegment(cwd: string, path: Path.Path) {
	return `${hostSegment(path.basename(cwd))}-${String.slice(0, 8)(Math.abs(Hash.string(cwd)).toString(16).padStart(8, '0'))}`
}

function frameworkCommand(source: string) {
	const words = Array.filter(String.split(/\s+/u)(source), String.isNonEmpty)
	if (Array.isReadonlyArrayEmpty(words)) return

	function skipFlags(index: number) {
		return (
			index +
			pipe(
				Array.drop(words, index),
				Array.findFirstIndex(word => !String.startsWith('-')(word)),
				Option.getOrElse(() => words.length - index)
			)
		)
	}

	const first = Option.getOrThrow(Array.head(words))
	if (first !== 'vp' && first !== 'vpx') return first
	if (first === 'vp') return first

	const commandIndex = skipFlags(1)
	const scriptIndex = words[commandIndex] === 'exec' || words[commandIndex] === 'dlx' ? commandIndex + 1 : commandIndex
	return words[skipFlags(scriptIndex)]
}

function frameworkHost(source: string) {
	const framework = frameworkCommand(source)
	if (framework === undefined) return

	switch (framework) {
		case 'vite': {
			return '127.0.0.1'
		}
		case 'vp': {
			return '127.0.0.1'
		}
		default:
	}
}

function commandFlags(source: string | undefined, port: number) {
	if (source === undefined) return []
	const host = frameworkHost(source)
	if (host === undefined) return []

	return ['--port', port.toString(), '--strictPort', '--host', host]
}

export function command(
	script: {readonly command?: string; readonly cwd: string; readonly taskId: string},
	port: number
) {
	return ChildProcess.make('vp', ['run', script.taskId, ...commandFlags(script.command, port)], {cwd: script.cwd})
}

function taskIdParts(taskId: string) {
	const index = taskId.indexOf('#')
	if (index <= 0) return {packageName: undefined, scriptName: undefined}
	const packageName = String.slice(0, index)(taskId)
	const scriptName = String.slice(index + 1)(taskId)
	return {
		packageName: String.isNonEmpty(packageName) ? packageName : undefined,
		scriptName: String.isNonEmpty(scriptName) ? scriptName : undefined
	}
}

function packageScripts(
	manifests: readonly {
		readonly packageJson: {
			readonly deslop: {readonly portless: readonly string[]}
			readonly name?: string
			readonly scripts: Readonly<Record<string, string>>
		}
		readonly packagePath: string
	}[]
) {
	const scripts = new Map<
		string,
		{readonly command: string; readonly packageName: string; readonly scriptName: string; readonly taskId: string}
	>()
	for (const manifest of manifests) {
		if (manifest.packageJson.name === undefined) continue
		for (const [scriptName, scriptCommand] of Object.entries(manifest.packageJson.scripts)) {
			const taskId = `${manifest.packageJson.name}#${scriptName}`
			scripts.set(taskId, {command: scriptCommand, packageName: manifest.packageJson.name, scriptName, taskId})
		}
	}
	return scripts
}

export const discover = Effect.fnUntraced(function* (
	cwd: string,
	input: {readonly origin: (host: string) => string; readonly port: (sessionId: string) => Effect.Effect<number>}
) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const output = yield* spawner.string(
		ChildProcess.make('git', ['ls-files', '-co', '--exclude-standard', '--', 'package.json', '**/package.json'], {cwd})
	)
	const packagePaths = Array.filter(
		String.split('\n')(output),
		packagePath => packagePath === 'package.json' || String.endsWith('/package.json')(packagePath)
	)
	const packageManifests = yield* Effect.forEach(
		packagePaths,
		packagePath =>
			pipe(
				fs.readFileString(path.join(cwd, packagePath)),
				Effect.flatMap(packageJson),
				Effect.map(manifest => ({packageJson: manifest, packagePath}))
			),
		{concurrency: 16}
	)
	const configuredTaskIds =
		Option.getOrUndefined(Array.findFirst(packageManifests, manifest => manifest.packagePath === 'package.json'))
			?.packageJson.deslop.portless ?? []
	const scripts = packageScripts(packageManifests)

	return yield* pipe(
		configuredTaskIds,
		Effect.forEach(taskId => {
			const script = scripts.get(taskId)
			const parts = taskIdParts(taskId)
			const packageName = script?.packageName ?? parts.packageName
			const scriptName = script?.scriptName ?? parts.scriptName
			const packageSegment = hostSegment(packageName ?? taskId)
			const scriptSegment = scriptHostSegment(scriptName ?? taskId)
			const worktree = worktreeHostSegment(cwd, path)
			const packageOrigin = input.origin(Array.join([packageSegment, worktree, 'localhost'], '.'))

			return Effect.map(input.port(taskId), port => {
				const host = Array.join([scriptSegment, packageSegment, worktree, 'localhost'], '.')
				const origin = input.origin(host)

				return {
					host,
					port,
					script: {
						baseOrigin: packageOrigin,
						...(script?.command === undefined ? {} : {command: script.command}),
						cwd,
						env: {
							HOST: '127.0.0.1',
							PORT: port.toString(),
							PORTLESS_BASE_ORIGIN: packageOrigin,
							PORTLESS_ORIGIN: origin,
							PORTLESS_URL: origin,
							VITE_PORTLESS_BASE_ORIGIN: packageOrigin,
							VITE_PORTLESS_ORIGIN: origin,
							VITE_PORTLESS_URL: origin
						},
						origin,
						...(packageName === undefined ? {} : {packageName}),
						portless: true,
						...(scriptName === undefined ? {} : {scriptName}),
						sessionId: taskId,
						taskId
					}
				}
			})
		}),
		Effect.map(routes => Array.sortWith(routes, route => route.script.taskId, Order.String))
	)
})
