import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {basename, dirname, relative} from 'node:path'

import {Array, Effect, Order, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {RunScript} from '#rpcs/contracts.ts'
import {TerminalError} from '@deslop/terminal/schema'

type PackageJson = {readonly name?: string; readonly scripts?: Readonly<Record<string, string>>}
type PortlessRoute = {
	readonly host: string
	readonly port: number
	readonly script: RunScript & {readonly env: Readonly<Record<string, string>>}
}

export const discoverRootScripts = Effect.fnUntraced(function* (cwd: string) {
	return yield* pipe(
		Effect.tryPromise({
			catch: cause => new TerminalError({cause, message: `failed to read root package.json in ${cwd}`}),
			try: () => readFile(`${cwd}/package.json`, 'utf8')
		}),
		Effect.map(source =>
			pipe(
				Object.entries((JSON.parse(source) as PackageJson).scripts ?? {}),
				Array.map(entry => ({
					command: entry[1],
					cwd,
					name: entry[0],
					packageFolder: basename(cwd),
					packagePath: 'package.json',
					sessionId: `package.json:${entry[0]}`
				}))
			)
		)
	)
})

export const discoverPortlessScripts = Effect.fnUntraced(function* (
	cwd: string,
	input: {readonly port: (sessionId: string) => Effect.Effect<number>}
) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const output = yield* pipe(
		spawner.string(
			ChildProcess.make('git', ['ls-files', '-co', '--exclude-standard', '--', 'package.json', '**/package.json'], {
				cwd
			})
		),
		Effect.mapError(cause => new TerminalError({cause, message: `failed to discover package.json files in ${cwd}`}))
	)

	return yield* pipe(
		pipe(
			String.split('\n')(output),
			Array.filter(path => path === 'package.json' || String.endsWith('/package.json')(path))
		),
		Array.map(packagePath =>
			pipe(
				Effect.tryPromise({
					catch: cause => new TerminalError({cause, message: `failed to read ${packagePath}`}),
					try: async () => {
						const fullPath = `${cwd}/${packagePath}`
						const source = await readFile(fullPath, 'utf8').catch(error => {
							if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
							throw error
						})
						if (source === undefined) return undefined

						return {fullPath, packageJson: JSON.parse(source) as PackageJson}
					}
				}),
				Effect.flatMap(result => {
					if (result === undefined) return Effect.succeed([])

					const folder = basename(dirname(result.fullPath))
					const relativePackagePath = relative(cwd, result.fullPath)
					const scriptEntries = pipe(
						Object.entries(result.packageJson.scripts ?? {}),
						Array.filter(entry => entry[0] === 'dev' || String.startsWith('dev:')(entry[0]))
					)
					const packageOrigin = `http://${[folder, basename(cwd), 'localhost'].join('.')}:${process.env['PORT'] ?? '4010'}`

					return pipe(
						scriptEntries,
						Array.map(entry => {
							const name = entry[0]
							const command = entry[1]

							return Effect.map(input.port(`${relativePackagePath}:${name}`), port => {
								const service = /^dev:(.+)$/u.exec(name)?.[1] ?? 'dev'
								const host = [service, folder, basename(cwd), 'localhost'].join('.')
								const origin = `http://${host}:${process.env['PORT'] ?? '4010'}`

								return {
									host,
									port,
									script: {
										baseOrigin: packageOrigin,
										command,
										cwd: dirname(result.fullPath),
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
										packagePath: relativePackagePath,
										service,
										sessionId: randomUUID()
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
		Effect.map(Array.flatten),
		Effect.map(
			Array.sort(
				pipe(
					Order.String,
					Order.mapInput((script: PortlessRoute) => `${script.script.packagePath}:${script.script.name}`)
				)
			)
		)
	)
})
