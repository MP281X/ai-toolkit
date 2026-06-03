import {Array, Effect, FileSystem, Option, Path, Schema, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

const PackageJson = Schema.Struct({scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))})

export function command(script: {readonly command: string; readonly name: string}, port: number) {
	return ChildProcess.make('vp', [
		'run',
		script.name,
		...(/^vp\s+dev(?:\s|$)/u.test(script.command)
			? ['--host', '127.0.0.1', '--port', port.toString(), '--strictPort']
			: [])
	])
}

export const discover = Effect.fn('Portless.discover')(function* (
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
		Array.map(packagePath =>
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
					const folder = path.basename(packageDirectory)
					const scriptEntries = pipe(
						Object.entries(packageJson.value.scripts ?? {}),
						Array.filter(entry => entry[0] === 'dev' || String.startsWith('dev:')(entry[0]))
					)
					const packageOrigin = input.origin([folder, path.basename(cwd), 'localhost'].join('.'))

					return pipe(
						scriptEntries,
						Array.map(entry => {
							const name = entry[0]
							const scriptCommand = entry[1]

							return Effect.map(input.port(`${packagePath}:${name}`), port => {
								const service = /^dev:(.+)$/u.exec(name)?.[1] ?? 'dev'
								const host = [service, folder, path.basename(cwd), 'localhost'].join('.')
								const origin = input.origin(host)

								return {
									host,
									port,
									script: {
										baseOrigin: packageOrigin,
										command: scriptCommand,
										cwd: packageDirectory,
										env: {
											HOST: '127.0.0.1',
											PORT: port.toString(),
											PORTLESS_BASE_ORIGIN: packageOrigin,
											PORTLESS_ORIGIN: origin,
											VITE_PORTLESS_BASE_ORIGIN: packageOrigin,
											VITE_PORTLESS_ORIGIN: origin
										},
										name,
										origin,
										packageFolder: folder,
										packagePath,
										service,
										sessionId: `${packagePath}:${name}:${Date.now()}:${Math.random()}`
									}
								}
							})
						}),
						Effect.all
					)
				})
			)
		),
		Effect.all,
		Effect.map(routes =>
			Array.flatten(routes).sort((left, right) =>
				`${left.script.packagePath}:${left.script.name}`.localeCompare(
					`${right.script.packagePath}:${right.script.name}`
				)
			)
		)
	)
})
