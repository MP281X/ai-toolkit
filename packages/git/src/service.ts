import {Array, Context, Effect, FileSystem, Layer, Number, Option, Path, pipe, Random, Result, String} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {GitDiffStatus} from './schema.ts'
import {GitBranch, GitDiff, GitError, GitRepository, GitWorktree, GitWorktreeStatus} from './schema.ts'

export class Git extends Context.Service<Git>()('@ai-toolkit/git/service/Git', {
	make: Effect.gen(function* () {
		const execLines = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.lines)
		const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path

		const execGitLines = Effect.fnUntraced(function* (cwd: string, args: string[]) {
			return yield* pipe(
				execLines(ChildProcess.make('git', args, {cwd})),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const execGitString = Effect.fnUntraced(function* (cwd: string, args: string[]) {
			return yield* pipe(
				execString(ChildProcess.make('git', args, {cwd})),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const getGitDirectory = Effect.fnUntraced(function* (cwd: string) {
			return yield* pipe(
				execGitString(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
				Effect.map(String.trim)
			)
		})

		const getDefaultBranch = Effect.fnUntraced(function* (cwd: string) {
			return yield* pipe(
				execGitString(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
				Effect.map(value => pipe(value, String.trim, String.replace(/^origin\//, ''))),
				Effect.catchTag('GitError', () =>
					pipe(
						execGitString(cwd, ['rev-parse', '--verify', 'main']),
						Effect.as('main'),
						Effect.catchTag('GitError', () => Effect.succeed('master'))
					)
				)
			)
		})

		const getWorktreeStatus = Effect.fnUntraced(function* (cwd: string, branch?: string) {
			const dirtyTracked = yield* pipe(
				execGitLines(cwd, ['status', '--porcelain', '--untracked-files=no']),
				Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
				Effect.orElseSucceed(() => false)
			)
			const untracked = yield* pipe(
				execGitLines(cwd, ['ls-files', '--others', '--exclude-standard']),
				Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
				Effect.orElseSucceed(() => false)
			)
			const counts = yield* pipe(
				execGitString(cwd, ['rev-list', '--left-right', '--count', `origin/${branch ?? ''}...HEAD`]),
				Effect.map(value => pipe(value, String.trim, String.split(/\s+/))),
				Effect.orElseSucceed(() => ['0', '0'])
			)
			const behind = pipe(
				Number.parse(counts[0] ?? '0'),
				Option.getOrElse(() => 0)
			)
			const ahead = pipe(
				Number.parse(counts[1] ?? '0'),
				Option.getOrElse(() => 0)
			)

			return new GitWorktreeStatus({ahead, behind, dirtyTracked, unpushedCommits: ahead > 0, untracked})
		})

		const getDiffs = Effect.fnUntraced(function* (cwd: string, args: string[]) {
			return yield* pipe(
				execGitLines(cwd, args),
				Effect.flatMap(
					Effect.forEach(
						line => {
							const filePath = pipe(line, String.split('\t'), Array.last, Option.getOrUndefined) ?? ''
							let status: GitDiffStatus = 'modified'

							if (pipe(line, String.startsWith('A'))) {
								status = 'added'
							} else if (pipe(line, String.startsWith('D'))) {
								status = 'deleted'
							} else if (pipe(line, String.startsWith('R'))) {
								status = 'renamed'
							}

							return Effect.map(
								execGitString(
									cwd,
									pipe(
										args,
										Array.dropRight(1),
										Array.appendAll(['--patch', '--find-renames', '-U999999', '--no-ext-diff', '--', filePath])
									)
								),
								patch => new GitDiff({filePath, patch, status})
							)
						},
						{concurrency: 'unbounded'}
					)
				)
			)
		})

		const getUntrackedDiffs = Effect.fnUntraced(function* (cwd: string) {
			const files = yield* execGitLines(cwd, ['ls-files', '--others', '--exclude-standard'])

			return yield* Effect.forEach(
				files,
				filePath =>
					Effect.map(
						pipe(
							fs.readFileString(path.join(cwd, filePath)),
							Effect.orElseSucceed(() => '')
						),
						content => {
							const contentLines = pipe(content, String.split('\n'))
							const lines = pipe(
								contentLines,
								Array.map(line => `+${line}`),
								Array.join('\n')
							)
							const patch = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${contentLines.length} @@\n${lines}`

							return new GitDiff({filePath, patch, status: 'added'})
						}
					),
				{concurrency: 'unbounded'}
			)
		})

		const ignoredDirectoryNames = new Set<string>([
			'.git',
			'.next',
			'.turbo',
			'build',
			'coverage',
			'dist',
			'node_modules'
		])

		return {
			clone: Effect.fnUntraced(function* (input: {cwd?: string; directory: string; url: string}) {
				const root = input.cwd ?? (yield* fs.realPath(process.env['HOME'] ?? '/home'))
				const targetDirectory = path.isAbsolute(input.directory) ? input.directory : path.join(root, input.directory)

				yield* pipe(fs.makeDirectory(targetDirectory, {recursive: true}), Effect.ignore)

				yield* pipe(
					execString(
						ChildProcess.make('git', ['clone', '--depth', '1', '--single-branch', input.url, targetDirectory], {
							cwd: root
						})
					),
					Effect.asVoid,
					Effect.catch(() =>
						pipe(
							execString(ChildProcess.make('git', ['-C', targetDirectory, 'pull', '--ff-only'])),
							Effect.asVoid,
							Effect.mapError(
								cause => new GitError({message: `failed to update ${targetDirectory} from ${input.url}`, cause})
							)
						)
					)
				)
			}),
			branches: Effect.fnUntraced(function* (input: {cwd: string}) {
				const localBranches = yield* pipe(
					execGitLines(input.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
					Effect.map(Array.map(name => new GitBranch({name, type: 'local'})))
				)
				const remoteBranches = yield* pipe(
					execGitLines(input.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']),
					Effect.map(lines =>
						pipe(
							lines,
							Array.filter(name => !pipe(name, String.endsWith('/HEAD'))),
							Array.map(name => {
								const parts = pipe(name, String.split('/'))
								const remote = parts[0] ?? 'origin'
								return new GitBranch({name: pipe(parts, Array.drop(1), Array.join('/')), remote, type: 'remote'})
							}),
							Array.filter(branch => pipe(branch.name, String.isNonEmpty))
						)
					)
				)

				return {
					branches: pipe(localBranches, Array.appendAll(remoteBranches)),
					defaultBranch: yield* getDefaultBranch(input.cwd)
				}
			}),
			createWorktree: Effect.fnUntraced(function* (input: {
				baseBranch: string
				branch: string
				cwd: string
				mode: 'existing-local' | 'existing-remote' | 'new-local'
			}) {
				const suffix = yield* Random.nextIntBetween(100_000, 999_999)
				const safeBranch = pipe(input.branch, String.replace(/[^a-zA-Z0-9._-]+/g, '-'))
				const safeRepository = pipe(path.basename(input.cwd), String.replace(/[^a-zA-Z0-9._-]+/g, '-'))
				const worktreesRoot = path.join(process.env['HOME'] ?? input.cwd, '.ai-toolkit', 'worktrees')
				const targetDirectory = path.join(worktreesRoot, `${safeRepository}-${safeBranch}-${suffix}`)

				yield* pipe(fs.makeDirectory(path.dirname(targetDirectory), {recursive: true}), Effect.ignore)

				if (input.mode === 'existing-local') {
					yield* pipe(execGitString(input.cwd, ['worktree', 'add', targetDirectory, input.branch]), Effect.asVoid)
					return targetDirectory
				}

				if (input.mode === 'existing-remote') {
					yield* pipe(execGitString(input.cwd, ['fetch', '--all', '--prune']), Effect.ignore)
					yield* pipe(
						execGitString(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, input.baseBranch]),
						Effect.asVoid
					)
					return targetDirectory
				}

				yield* pipe(
					execGitString(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, input.baseBranch]),
					Effect.asVoid
				)
				return targetDirectory
			}),
			deleteWorktree: Effect.fnUntraced(function* (input: {cwd: string; force: boolean}) {
				const worktree = yield* pipe(
					execGitLines(input.cwd, ['worktree', 'list', '--porcelain']),
					Effect.map(lines => {
						let mainRoot = input.cwd
						let currentRoot = ''
						let currentBranch: string | undefined

						for (const line of lines) {
							if (pipe(line, String.startsWith('worktree '))) {
								currentRoot = pipe(line, String.replace(/^worktree\s+/, ''))
								if (mainRoot === input.cwd) {
									mainRoot = currentRoot
								}
								currentBranch = undefined
							}

							if (pipe(line, String.startsWith('branch refs/heads/'))) {
								currentBranch = pipe(line, String.replace(/^branch\s+refs\/heads\//, ''))
							}

							if (currentRoot === input.cwd && currentBranch) {
								return {branch: currentBranch, mainRoot}
							}
						}

						return {branch: undefined, mainRoot}
					})
				)

				yield* pipe(
					execGitString(worktree.mainRoot, ['worktree', 'remove', ...(input.force ? ['--force'] : []), input.cwd]),
					Effect.asVoid
				)

				if (worktree.branch) {
					yield* pipe(execGitString(worktree.mainRoot, ['branch', '-D', worktree.branch]), Effect.ignore)
				}
			}),
			listWorktrees: Effect.fnUntraced(function* (input: {cwd: string}) {
				const lines = yield* execGitLines(input.cwd, ['worktree', 'list', '--porcelain'])
				const worktrees = []
				let currentRoot = ''
				let hasCurrentCommit = false
				let currentBranch: string | undefined

				for (const line of lines) {
					if (pipe(line, String.startsWith('worktree '))) {
						if (currentRoot !== '' && hasCurrentCommit) {
							worktrees.push(
								new GitWorktree({
									branch: currentBranch,
									root: currentRoot,
									status: yield* getWorktreeStatus(currentRoot, currentBranch)
								})
							)
						}

						currentRoot = pipe(line, String.replace(/^worktree\s+/, ''))
						hasCurrentCommit = false
						currentBranch = undefined
						continue
					}

					if (pipe(line, String.startsWith('HEAD '))) {
						hasCurrentCommit = true
						continue
					}

					if (pipe(line, String.startsWith('branch refs/heads/'))) {
						currentBranch = pipe(line, String.replace(/^branch\s+refs\/heads\//, ''))
					}
				}

				if (currentRoot !== '' && hasCurrentCommit) {
					worktrees.push(
						new GitWorktree({
							branch: currentBranch,
							root: currentRoot,
							status: yield* getWorktreeStatus(currentRoot, currentBranch)
						})
					)
				}

				return worktrees
			}),
			listRepositoriesFrom: Effect.fnUntraced(function* (input: {cwd: string}) {
				const roots = [
					yield* pipe(
						fs.realPath(input.cwd),
						Effect.orElseSucceed(() => input.cwd)
					)
				]
				const repositories = []

				while (Array.isArrayNonEmpty(roots)) {
					const currentRoot = roots.pop()
					if (!currentRoot) {
						continue
					}

					const entries = yield* pipe(
						fs.readDirectory(currentRoot),
						Effect.orElseSucceed(() => Array.empty<string>())
					)

					if (pipe(entries, Array.contains('.git'))) {
						const repository = yield* pipe(
							getGitDirectory(currentRoot),
							Effect.map(gitDirectory => Result.succeed(new GitRepository({gitDirectory, root: currentRoot}))),
							Effect.orElseSucceed(() => Result.failVoid)
						)

						repositories.push(repository)
						continue
					}

					for (const entry of entries) {
						if (ignoredDirectoryNames.has(entry) || (pipe(entry, String.startsWith('.')) && entry !== '.git')) {
							continue
						}

						const entryPath = path.join(currentRoot, entry)
						const info = yield* pipe(
							fs.stat(entryPath),
							Effect.orElseSucceed(() => undefined)
						)

						if (info?.type !== 'Directory') {
							continue
						}

						roots.push(entryPath)
					}
				}

				return pipe(
					repositories,
					Array.getSuccesses,
					Array.dedupeWith((left, right) => left.gitDirectory === right.gitDirectory)
				)
			}),
			stageFile: Effect.fnUntraced(function* (input: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(input.cwd, ['add', '--', input.filePath]), Effect.asVoid)
			}),
			reviewDiffs: Effect.fnUntraced(function* (input: {cwd: string; scope: 'staged-to-worktree' | 'head-to-staged'}) {
				const diffs = yield* getDiffs(
					input.cwd,
					input.scope === 'head-to-staged' ? ['diff', '--cached', '--name-status'] : ['diff', '--name-status']
				)

				if (input.scope === 'head-to-staged') {
					return diffs
				}

				return pipe(diffs, Array.appendAll(yield* getUntrackedDiffs(input.cwd)))
			}),
			unstageFile: Effect.fnUntraced(function* (input: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(input.cwd, ['reset', 'HEAD', '--', input.filePath]), Effect.asVoid)
			}),
			discardFile: Effect.fnUntraced(function* (input: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(input.cwd, ['reset', 'HEAD', '--', input.filePath]), Effect.ignore)
				yield* pipe(
					execGitString(input.cwd, ['restore', '--worktree', '--source=HEAD', '--', input.filePath]),
					Effect.ignore
				)
				yield* pipe(execGitString(input.cwd, ['clean', '-fd', '--', input.filePath]), Effect.asVoid)
			})
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
