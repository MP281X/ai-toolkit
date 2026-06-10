import {Array, Effect, FileSystem, Hash, Option, Path, Schema, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

const PackageJson = Schema.Struct({scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))})

function hostSegment(value: string) {
	const segment = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
	return String.isEmpty(segment) ? 'app' : segment
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

function hasFlag(flag: string) {
	return (word: string) => word === flag || String.startsWith(`${flag}=`)(word)
}

function commandFlags(source: string, port: number) {
	const framework = frameworkFlagConfig(source)
	if (framework === undefined) return []

	const words = pipe(String.split(/\s+/u)(source), Array.filter(String.isNonEmpty))

	return [
		...(Array.some(words, hasFlag('--port'))
			? []
			: ['--port', port.toString(), ...(framework.strictPort ? ['--strictPort'] : [])]),
		...(Array.some(words, hasFlag('--host')) ? [] : ['--host', framework.host])
	]
}

export function command(
	script: {readonly command: string; readonly commandCwd?: string; readonly cwd?: string; readonly name: string},
	port: number
) {
	return ChildProcess.make('vp', ['run', script.name, ...commandFlags(script.command, port)], {
		cwd: script.commandCwd ?? script.cwd
	})
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

	return yield* pipe(
		pipe(
			String.split('\n')(output),
			Array.filter(packagePath => packagePath === 'package.json' || String.endsWith('/package.json')(packagePath))
		),
		Effect.forEach(packagePath =>
			pipe(
				fs.readFileString(path.join(cwd, packagePath)),
				Effect.flatMap(source =>
					Effect.try({
						catch: error => error,
						try: () => pipe(JSON.parse(source), Schema.decodeUnknownOption(PackageJson))
					})
				),
				Effect.catch(() => Effect.succeed(Option.none())),
				Effect.flatMap(packageJson => {
					if (Option.isNone(packageJson)) return Effect.succeed([])

					const packageDirectory = packagePath === 'package.json' ? cwd : path.join(cwd, path.dirname(packagePath))
					const folder = hostSegment(path.basename(packageDirectory))
					const worktree = worktreeHostSegment(cwd, path)
					const scriptEntries = pipe(
						Object.entries(packageJson.value.scripts ?? {}),
						Array.filter(entry => entry[0] === 'dev' || String.startsWith('dev:')(entry[0]))
					)
					const packageOrigin = input.origin([folder, worktree, 'localhost'].join('.'))

					return pipe(
						scriptEntries,
						Effect.forEach(entry => {
							const name = entry[0]
							const scriptCommand = entry[1]

							return Effect.map(input.port(`${packagePath}:${name}`), port => {
								const service = /^dev:(.+)$/u.exec(name)?.[1] ?? 'dev'
								const serviceSegment = hostSegment(service)
								const host = [serviceSegment, folder, worktree, 'localhost'].join('.')
								const origin = input.origin(host)

								return {
									host,
									port,
									script: {
										baseOrigin: packageOrigin,
										command: scriptCommand,
										commandCwd: packageDirectory,
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
										name,
										origin,
										packageFolder: folder,
										packagePath,
										service,
										sessionId: `${packagePath}:${name}`
									}
								}
							})
						})
					)
				})
			)
		),
		Effect.map(routes =>
			Array.flatten(routes).sort((left, right) =>
				`${left.script.packagePath}:${left.script.name}`.localeCompare(
					`${right.script.packagePath}:${right.script.name}`
				)
			)
		)
	)
})
