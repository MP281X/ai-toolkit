import {Array, Effect, FileSystem, Path, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

type PackageJson = {readonly name?: string; readonly scripts?: Readonly<Record<string, string>>}
type PackageEntry = {readonly packageJson: PackageJson; readonly packagePath: string}

export function command(script: {readonly command: string; readonly name: string}, port: number) {
	return ChildProcess.make('vp', [
		'run',
		script.name,
		...(/^vp\s+dev(?:\s|$)/u.test(script.command)
			? ['--host', '127.0.0.1', '--port', port.toString(), '--strictPort']
			: [])
	])
}

export const discover = Effect.fnUntraced(function* (
	cwd: string,
	input: {readonly port: (sessionId: string) => Effect.Effect<number>; readonly proxyPort: string}
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
			Array.filter(path => path === 'package.json' || String.endsWith('/package.json')(path))
		),
		Array.map(packagePath =>
			pipe(
				pipe(
					fs.readFileString(path.join(cwd, packagePath)),
					Effect.map(source => ({packageJson: JSON.parse(source) as PackageJson, packagePath}) satisfies PackageEntry),
					Effect.catch(() => Effect.succeed(undefined as PackageEntry | undefined))
				),
				Effect.flatMap(result => {
					if (result === undefined) return Effect.succeed([])

					const packageDirectory =
						result.packagePath === 'package.json' ? cwd : path.join(cwd, path.dirname(result.packagePath))
					const folder = path.basename(packageDirectory)
					const scriptEntries = pipe(
						Object.entries(result.packageJson.scripts ?? {}),
						Array.filter(entry => entry[0] === 'dev' || String.startsWith('dev:')(entry[0]))
					)
					const packageOrigin = `http://${[folder, path.basename(cwd), 'localhost'].join('.')}:${input.proxyPort}`

					return pipe(
						scriptEntries,
						Array.map(entry => {
							const name = entry[0]
							const scriptCommand = entry[1]

							return Effect.map(input.port(`${result.packagePath}:${name}`), port => {
								const service = /^dev:(.+)$/u.exec(name)?.[1] ?? 'dev'
								const host = [service, folder, path.basename(cwd), 'localhost'].join('.')
								const origin = `http://${host}:${input.proxyPort}`

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
										packagePath: result.packagePath,
										service,
										sessionId: `${result.packagePath}:${name}:${Date.now()}:${Math.random()}`
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
