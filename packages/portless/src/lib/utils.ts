import * as NodeFs from 'node:fs'
import * as NodePath from 'node:path'

import {Array, Effect, Function, Hash, HashMap, Option, Order, Predicate, Record, Schema, String, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {PortlessPackageJson} from '../schema.ts'

function packageJson(source: string) {
	const manifest = pipe(
		source,
		Schema.decodeUnknownOption(Schema.fromJsonString(PortlessPackageJson)),
		Option.getOrElse(() => PortlessPackageJson.make({}))
	)

	return {
		deslop: {portless: manifest.deslop?.portless ?? Array.empty<string>()},
		name: Predicate.isNotUndefined(manifest.name) && String.isNonEmpty(manifest.name) ? manifest.name : undefined,
		scripts: manifest.scripts ?? {}
	}
}

function hostSegment(value: string) {
	const segment = pipe(
		value,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9-]+/gu, '-'),
		String.replace(/^-+|-+$/gu, '')
	)
	return String.isEmpty(segment) ? 'app' : segment
}

function scriptHostSegment(value: string) {
	return hostSegment(String.startsWith('dev:')(value) ? String.slice(4)(value) : value)
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
const FrameworkCommand = Schema.Literals([
	'astro',
	'expo',
	'ng',
	'react-native',
	'react-router',
	'rsbuild',
	'vite',
	'vp'
])

const ignoredPackageManifestDirectories = ['build', 'dist', 'node_modules', 'target'] as const
const packageRunners = ['bunx', 'npx', 'pnpm', 'pnpx', 'yarn'] as const
const packageRunnerSubcommands = ['dlx', 'exec'] as const

function commandAt(
	words: readonly string[],
	index: number
): {readonly command: string; readonly index: number} | undefined {
	const current = words[index]
	if (Predicate.isUndefined(current)) return
	return String.startsWith('-')(current) ? commandAt(words, index + 1) : {command: current, index}
}

function frameworkCommand(source: string) {
	const words = pipe(String.split(/\s+/u)(source), Array.filter(String.isNonEmpty))
	if (Array.isReadonlyArrayEmpty(words)) return

	const first = words[0]
	if (Predicate.isUndefined(first)) return
	if (!pipe(packageRunners, Array.contains(first))) return first

	const resolved = commandAt(words, 1)
	if (Predicate.isUndefined(resolved)) return
	const subcommand = pipe(packageRunnerSubcommands, Array.contains(resolved.command))
	return subcommand ? commandAt(words, resolved.index + 1)?.command : resolved.command
}

function frameworkFlagConfig(source: string) {
	return pipe(
		frameworkCommand(source),
		Schema.decodeUnknownOption(FrameworkCommand),
		Option.map(framework => frameworkFlags[framework]),
		Option.getOrUndefined
	)
}

function commandFlags(source: string | undefined, port: number) {
	if (Predicate.isUndefined(source)) return []
	const framework = frameworkFlagConfig(source)
	if (Predicate.isUndefined(framework)) return []

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
	const packageName = String.slice(0, index)(taskId)
	const scriptName = String.slice(index + 1)(taskId)
	return {
		packageName: String.isNonEmpty(packageName) ? packageName : undefined,
		scriptName: String.isNonEmpty(scriptName) ? scriptName : undefined
	}
}

function addPackageScripts(
	scripts: HashMap.HashMap<
		string,
		{readonly command: string; readonly packageName: string; readonly scriptName: string; readonly taskId: string}
	>,
	packageName: string,
	source: {readonly [key: string]: string}
) {
	return pipe(
		source,
		Record.toEntries,
		Array.reduce(scripts, (current, [scriptName, scriptCommand]) => {
			const taskId = `${packageName}#${scriptName}`
			return HashMap.set(current, taskId, {command: scriptCommand, packageName, scriptName, taskId})
		})
	)
}

function packageScripts(
	manifests: readonly {readonly packageJson: ReturnType<typeof packageJson>; readonly packagePath: string}[]
) {
	return Array.reduce(
		manifests,
		HashMap.empty<
			string,
			{readonly command: string; readonly packageName: string; readonly scriptName: string; readonly taskId: string}
		>(),
		(scripts, manifest) => {
			if (Predicate.isUndefined(manifest.packageJson.name)) return scripts
			return addPackageScripts(scripts, manifest.packageJson.name, manifest.packageJson.scripts)
		}
	)
}

function readDirectoryEntries(directory: string) {
	try {
		return NodeFs.readdirSync(directory, {withFileTypes: true})
	} catch {
		return []
	}
}

function readTextFile(filePath: string) {
	try {
		return NodeFs.readFileSync(filePath, 'utf8')
	} catch {
		return void 0
	}
}

function packageJsonPaths(cwd: string) {
	const pending = ['']
	const packagePaths = Array.empty<string>()

	while (!Array.isReadonlyArrayEmpty(pending)) {
		const directory = pending.pop() ?? ''
		const absoluteDirectory = directory === '' ? cwd : NodePath.join(cwd, directory)
		const entries = readDirectoryEntries(absoluteDirectory)

		for (const entry of entries) {
			const relative = directory === '' ? entry.name : NodePath.join(directory, entry.name)
			if (entry.name === 'package.json' && entry.isFile()) {
				packagePaths.push(relative)
				continue
			}
			if (!entry.isDirectory()) continue
			if (String.startsWith('.')(entry.name)) continue
			if (pipe(ignoredPackageManifestDirectories, Array.contains(entry.name))) continue

			pending.push(relative)
		}
	}

	return pipe(packagePaths, Array.sortWith(Function.identity, Order.String))
}

function readPackageManifests(cwd: string) {
	return pipe(
		packageJsonPaths(cwd),
		Array.flatMap(packagePath => {
			const source = readTextFile(NodePath.join(cwd, packagePath))
			return Predicate.isUndefined(source) ? [] : [{packageJson: packageJson(source), packagePath}]
		})
	)
}

export const discover = Effect.fnUntraced(function* (
	cwd: string,
	input: {readonly origin: (host: string) => string; readonly port: (sessionId: string) => Effect.Effect<number>}
) {
	const packageManifests = readPackageManifests(cwd)
	const configuredTaskIds = pipe(
		packageManifests,
		Array.findFirst(manifest => manifest.packagePath === 'package.json'),
		Option.map(manifest => manifest.packageJson.deslop.portless),
		Option.getOrElse(() => Array.empty<string>())
	)
	const scripts = packageScripts(packageManifests)

	return yield* pipe(
		configuredTaskIds,
		Effect.forEach(taskId => {
			const script = pipe(scripts, HashMap.get(taskId), Option.getOrUndefined)
			const parts = taskIdParts(taskId)
			const packageName = script?.packageName ?? parts.packageName
			const scriptName = script?.scriptName ?? parts.scriptName
			const packageSegment = hostSegment(packageName ?? taskId)
			const scriptSegment = scriptHostSegment(scriptName ?? taskId)
			const worktree = `${hostSegment(NodePath.basename(cwd))}-${pipe(
				Math.abs(Hash.string(cwd)).toString(16),
				String.padStart(8, '0'),
				String.slice(0, 8)
			)}`
			const packageOrigin = input.origin(pipe([packageSegment, worktree, 'localhost'], Array.join('.')))

			return Effect.map(input.port(taskId), port => {
				const host = pipe([scriptSegment, packageSegment, worktree, 'localhost'], Array.join('.'))
				const origin = input.origin(host)

				return {
					host,
					port,
					script: {
						baseOrigin: packageOrigin,
						...(Predicate.isUndefined(script?.command) ? {} : {command: script.command}),
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
						...(Predicate.isUndefined(packageName) ? {} : {packageName}),
						portless: true,
						...(Predicate.isUndefined(scriptName) ? {} : {scriptName}),
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
