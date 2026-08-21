import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Effect, FileSystem, Path, Stream, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

describe('deslop-linter executable', () => {
	it.layer(NodeServices.layer)(test => {
		test.effect('returns Oxlint status and output while discovering tsconfig', () =>
			pipe(
				Effect.gen(function* () {
					const fs = yield* FileSystem.FileSystem
					const path = yield* Path.Path
					const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
					const cwd = yield* fs.makeTempDirectoryScoped({prefix: 'deslop-linter-cli-'})
					yield* fs.writeFileString(path.join(cwd, 'package.json'), '{"name":"fixture","type":"module"}')
					yield* fs.writeFileString(path.join(cwd, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}')
					yield* fs.writeFileString(path.join(cwd, 'invalid.ts'), 'async function invalid() {}\nexport {invalid}\n')
					const handle = yield* spawner.spawn(
						ChildProcess.make(process.execPath, [path.resolve(import.meta.dirname, 'cli.ts'), '--all'], {
							cwd,
							stderr: 'pipe',
							stdout: 'pipe'
						})
					)
					const result = yield* Effect.all(
						{
							exitCode: handle.exitCode,
							stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
							stdout: Stream.mkString(Stream.decodeText(handle.stdout))
						},
						{concurrency: 'unbounded'}
					)
					expect(result.exitCode).toBe(ChildProcessSpawner.ExitCode(1))
					expect(result.stderr).toBe('')
					expect(String.includes('effecttsgo(async-function)')(result.stdout)).toBe(true)
				}),
				Effect.scoped
			)
		)
	})
})
