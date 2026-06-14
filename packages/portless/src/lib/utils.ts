import {Array, Effect, FileSystem, Hash, Option, Order, Path, Schema, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

type PackageJson = {
	readonly deslop: {readonly portless: readonly string[]}
	readonly name?: string
	readonly scripts: Readonly<Record<string, string>>
}

type PackageManifest = {readonly packageJson: PackageJson; readonly packagePath: string}

type PackageScript = {
	readonly command: string
	readonly packageName: string
	readonly scriptName: string
	readonly taskId: string
}

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown)
const ScriptRecord = Schema.Record(Schema.String, Schema.String)
const JsonArray = Schema.Array(Schema.Unknown)

function emptyJsonRecord(): Readonly<Record<string, unknown>> {
	return {}
}

function emptyScriptRecord(): Readonly<Record<string, string>> {
	return {}
}

function emptyStringArray(): readonly string[] {
	return []
}

function packageJson(source: string): PackageJson {
	const value = JSON.parse(source) as unknown
	const record: Readonly<Record<string, unknown>> = pipe(
		value,
		Schema.decodeUnknownOption(JsonRecord),
		Option.getOrElse(emptyJsonRecord)
	)
	const deslop: Readonly<Record<string, unknown>> = pipe(
		record['deslop'],
		Schema.decodeUnknownOption(JsonRecord),
		Option.getOrElse(emptyJsonRecord)
	)
	const portless = pipe(
		deslop['portless'],
		Schema.decodeUnknownOption(JsonArray),
		Option.map(values => values.filter((item): item is string => typeof item === 'string')),
		Option.getOrElse(emptyStringArray)
	)
	const scripts = pipe(record['scripts'], Schema.decodeUnknownOption(ScriptRecord), Option.getOrElse(emptyScriptRecord))
	const nameValue = record['name']
	const name = typeof nameValue === 'string' && String.isNonEmpty(nameValue) ? nameValue : undefined

	return {deslop: {portless}, name, scripts}
}

function hostSegment(value: string) {
	const segment = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
	return String.isEmpty(segment) ? 'app' : segment
}

function scriptHostSegment(value: string) {
	return hostSegment(value.startsWith('dev:') ? value.slice(4) : value)
}

function worktreeHostSegment(cwd: string, path: Path.Path) {
	return `${hostSegment(path.basename(cwd))}-${Math.abs(Hash.string(cwd)).toString(16).padStart(8, '0').slice(0, 8)}`
}

const frameworkFlags = {
	astro: {host: '127.0.0.1', strictPort: false},
	expo: {host: 'localhost', strictPort: false},
	ng: {host: '127.0.0.1', strictPort: false},
	'react-native': {host: '127.0.0.1', strictPort: false},
	'react-router': {host: '127.0.0.1', strictPort: true},
	rsbuild: {host: '127.0.0.1', strictPort: false},
	vite: {host: '127.0.0.1', strictPort: true},
	vp: {host: '127.0.0.1', strictPort: true}
} as const

const packageRunners = new Set(['bunx', 'npx', 'pnpm', 'pnpx', 'yarn'])
const packageRunnerSubcommands = new Set(['dlx', 'exec'])

function frameworkCommand(source: string) {
	const words = pipe(String.split(/\s+/u)(source), Array.filter(String.isNonEmpty))
	if (Array.isReadonlyArrayEmpty(words)) return

	const first = words[0]
	if (!packageRunners.has(first)) return first

	let index = 1
	while (words[index]?.startsWith('-')) index += 1
	if (packageRunnerSubcommands.has(words[index] ?? '')) index += 1
	while (words[index]?.startsWith('-')) index += 1
	return words[index]
}

function frameworkFlagConfig(source: string) {
	const framework = frameworkCommand(source)
	if (framework === undefined) return

	switch (framework) {
		case 'astro':
			return frameworkFlags.astro
		case 'expo':
			return frameworkFlags.expo
		case 'ng':
			return frameworkFlags.ng
		case 'react-native':
			return frameworkFlags['react-native']
		case 'react-router':
			return frameworkFlags['react-router']
		case 'rsbuild':
			return frameworkFlags.rsbuild
		case 'vite':
			return frameworkFlags.vite
		case 'vp':
			return frameworkFlags.vp
		default:
	}
}

function commandFlags(source: string | undefined, port: number) {
	if (source === undefined) return []
	const framework = frameworkFlagConfig(source)
	if (framework === undefined) return []

	return ['--port', port.toString(), ...(framework.strictPort ? ['--strictPort'] : []), '--host', framework.host]
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
	const packageName = taskId.slice(0, index)
	const scriptName = taskId.slice(index + 1)
	return {
		packageName: String.isNonEmpty(packageName) ? packageName : undefined,
		scriptName: String.isNonEmpty(scriptName) ? scriptName : undefined
	}
}

function packageScripts(manifests: readonly PackageManifest[]) {
	const scripts = new Map<string, PackageScript>()
	for (const manifest of manifests) {
		const packageName = manifest.packageJson.name
		if (packageName === undefined) continue
		for (const [scriptName, scriptCommand] of Object.entries(manifest.packageJson.scripts)) {
			const taskId = `${packageName}#${scriptName}`
			scripts.set(taskId, {command: scriptCommand, packageName, scriptName, taskId})
		}
	}
	return scripts
}

export const discover = Effect.fnUntraced(function* (
	cwd: string,
	input: {readonly origin: (host: string) => string; readonly port: (sessionId: string) => Effect.Effect<number>}
) {
	const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const output = yield* execString(
		ChildProcess.make('git', ['ls-files', '-co', '--exclude-standard', '--', 'package.json', '**/package.json'], {cwd})
	)
	const packagePaths = pipe(
		String.split('\n')(output),
		Array.filter(packagePath => packagePath === 'package.json' || String.endsWith('/package.json')(packagePath))
	)
	const packageManifests: readonly PackageManifest[] = yield* pipe(
		packagePaths,
		Effect.forEach(
			packagePath =>
				pipe(
					fs.readFileString(path.join(cwd, packagePath)),
					Effect.flatMap(source => Effect.try({catch: error => error, try: () => packageJson(source)})),
					Effect.map(manifest => Option.some(manifest)),
					Effect.catch(() => Effect.succeed(Option.none<PackageJson>())),
					Effect.map(Option.match({onNone: () => [], onSome: manifest => [{packageJson: manifest, packagePath}]}))
				),
			{concurrency: 16}
		),
		Effect.map(Array.flatten)
	)
	const configuredTaskIds =
		packageManifests.find(manifest => manifest.packagePath === 'package.json')?.packageJson.deslop.portless ?? []
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
			const packageOrigin = input.origin([packageSegment, worktree, 'localhost'].join('.'))

			return Effect.map(input.port(taskId), port => {
				const host = [scriptSegment, packageSegment, worktree, 'localhost'].join('.')
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
		Effect.map(routes =>
			pipe(
				routes,
				Array.sortWith(route => route.script.taskId, Order.String)
			)
		)
	)
})
