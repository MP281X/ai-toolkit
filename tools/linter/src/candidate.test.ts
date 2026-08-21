import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import {Array, Effect, Exit, FileSystem, Option, Path, Record, String, pipe} from 'effect'

import {candidatePaths, parseMode} from './candidate.ts'

const outputs: Record<string, string> = {
	'diff --cached --name-status -z': 'A\0src/staged.ts\0',
	'diff --name-status -z': 'M\0src/unstaged.tsx\0D\0src/deleted.ts\0',
	'diff --name-status -z base...HEAD': 'M\0src/branch.ts\0R100\0src/old.ts\0src/renamed.ts\0',
	'ls-files --others --exclude-standard -z': 'src/untracked.mts\0README.md\0',
	'merge-base HEAD refs/remotes/origin/main': 'base\n',
	'symbolic-ref --quiet refs/remotes/origin/HEAD': 'refs/remotes/origin/main\n'
}

function mockGit(arguments_: string[]) {
	return Effect.succeed(
		pipe(
			arguments_,
			Array.join(' '),
			key => Record.get(outputs, key),
			Option.getOrElse(() => '')
		)
	)
}

describe('candidate selection', () => {
	it.effect('rejects conflicting modes and accepts explicit modes', () =>
		Effect.gen(function* () {
			expect(Exit.isFailure(yield* Effect.exit(parseMode(['--all', '--branch'])))).toBe(true)
			expect(yield* parseMode(['--all'])).toBe('all')
			expect(yield* parseMode(['--branch'])).toBe('branch')
			expect(yield* parseMode(['--uncommitted'])).toBe('uncommitted')
		})
	)

	it.layer(NodeServices.layer)(test => {
		test.effect('selects branch and uncommitted candidate sets', () =>
			Effect.gen(function* () {
				const branch = yield* candidatePaths({cwd: '/repo', mode: 'branch', runGit: mockGit})
				expect(pipe(branch, Array.sort(String.Order))).toEqual(['/repo/src/branch.ts', '/repo/src/renamed.ts'])
				const uncommitted = yield* candidatePaths({cwd: '/repo', mode: 'uncommitted', runGit: mockGit})
				expect(pipe(uncommitted, Array.sort(String.Order))).toEqual([
					'/repo/src/staged.ts',
					'/repo/src/unstaged.tsx',
					'/repo/src/untracked.mts'
				])
				const combined = yield* candidatePaths({cwd: '/repo', mode: 'default', runGit: mockGit})
				expect(combined).toHaveLength(5)
			})
		)

		test.effect('excludes dependencies, outputs, templates, generated files, and non-source files from all', () =>
			pipe(
				Effect.gen(function* () {
					const fs = yield* FileSystem.FileSystem
					const path = yield* Path.Path
					const root = yield* fs.makeTempDirectoryScoped({prefix: 'candidate-'})
					const files = [
						'src/kept.ts',
						'node_modules/dependency.ts',
						'dist/output.ts',
						'.output/server.ts',
						'tools/create-app/template/src/template.ts',
						'packages/components/src/components/ui/button.tsx',
						'src/route.gen.ts',
						'README.md'
					]
					yield* Effect.forEach(files, file =>
						pipe(
							fs.makeDirectory(path.dirname(path.join(root, file)), {recursive: true}),
							Effect.andThen(fs.writeFileString(path.join(root, file), ''))
						)
					)
					expect(yield* candidatePaths({cwd: root, mode: 'all'})).toEqual([path.join(root, 'src/kept.ts')])
				}),
				Effect.scoped
			)
		)

		test.effect('returns no candidates for a clean workspace', () =>
			Effect.gen(function* () {
				expect(yield* candidatePaths({cwd: '/repo', mode: 'uncommitted', runGit: () => Effect.succeed('')})).toEqual([])
			})
		)
	})
})
