import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {basename, dirname, relative} from 'node:path'

import {Array, Effect, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {RunScript} from '#rpcs/contracts.ts'
import {TerminalError} from '@deslop/terminal/schema'

export type PackageJson = {readonly name?: string; readonly scripts?: Readonly<Record<string, string>>}
export type PortlessRunScript = RunScript & {readonly env: Readonly<Record<string, string>>}
export type PortlessRoute = {readonly host: string; readonly port: number; readonly script: PortlessRunScript}

function includeScript(name: string) {
	return name === 'dev' || name.startsWith('dev:')
}

function scriptService(name: string) {
	return /^dev:(.+)$/u.exec(name)?.[1] ?? 'dev'
}

function scriptOrigin(input: {readonly folder: string; readonly root: string; readonly service: string}) {
	return `http://${[input.service, input.folder, basename(input.root), 'localhost'].join('.')}:${process.env['PORT'] ?? '4010'}`
}

function baseOrigin(input: {readonly folder: string; readonly root: string}) {
	return `http://${[input.folder, basename(input.root), 'localhost'].join('.')}:${process.env['PORT'] ?? '4010'}`
}

export function rootScriptsFromPackage(input: {readonly cwd: string; readonly packageJson: PackageJson}) {
	return pipe(
		Object.entries(input.packageJson.scripts ?? {}),
		Array.map(([name, command]) => ({
			command,
			cwd: input.cwd,
			name,
			packageFolder: basename(input.cwd),
			packagePath: 'package.json',
			sessionId: `package.json:${name}`
		}))
	)
}

export const discoverRootScripts = Effect.fnUntraced(function* (cwd: string) {
	return yield* Effect.tryPromise({
		catch: cause => new TerminalError({cause, message: `failed to read root package.json in ${cwd}`}),
		try: async () => {
			const packageJson = JSON.parse(await readFile(`${cwd}/package.json`, 'utf8')) as PackageJson

			return rootScriptsFromPackage({cwd, packageJson})
		}
	})
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
		output.split('\n').filter(path => path === 'package.json' || path.endsWith('/package.json')),
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
					const scriptEntries = Object.entries(result.packageJson.scripts ?? {}).filter(([name]) => includeScript(name))
					const packageOrigin = baseOrigin({folder, root: cwd})

					return pipe(
						scriptEntries,
						Array.map(([name, command]) =>
							Effect.map(input.port(`${relativePackagePath}:${name}`), port => {
								const service = scriptService(name)
								const host = [service, folder, basename(cwd), 'localhost'].join('.')
								const origin = scriptOrigin({folder, root: cwd, service})

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
						),
						Effect.all
					)
				})
			)
		),
		Effect.all,
		Effect.map(discovered => discovered.flat()),
		Effect.map(scripts =>
			scripts.sort((left, right) =>
				`${left.script.packagePath}:${left.script.name}`.localeCompare(
					`${right.script.packagePath}:${right.script.name}`
				)
			)
		)
	)
})
