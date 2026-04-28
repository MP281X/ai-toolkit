import {
	Array,
	Context,
	Duration,
	Effect,
	FileSystem,
	Layer,
	Path,
	pipe,
	RcMap,
	Result,
	Stream,
	String,
	SubscriptionRef
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {GitDiff, GitError, GitRepository, GitWorktree} from './schema.ts'

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

		const getDiffs = Effect.fnUntraced(function* (cwd: string, args: string[]) {
			return yield* pipe(
				execGitLines(cwd, args),
				Effect.flatMap(
					Effect.forEach(
						filePath =>
							Effect.map(
								execGitString(
									cwd,
									pipe(
										args,
										Array.dropRight(1),
										Array.appendAll(['--patch', '--find-renames', '-U999999', '--no-ext-diff', '--', filePath])
									)
								),
								patch => new GitDiff({filePath, patch})
							),
						{concurrency: 'unbounded'}
					)
				)
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

		const worktrees = yield* RcMap.make({
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const getStagedDiffs = getDiffs(cwd, ['diff', '--cached', '--name-only'])
				const getUnstagedDiffs = getDiffs(cwd, ['diff', '--name-only'])
				const stagedDiffs = yield* Effect.andThen(getStagedDiffs, SubscriptionRef.make)
				const unstagedDiffs = yield* Effect.andThen(getUnstagedDiffs, SubscriptionRef.make)

				yield* Effect.forkScoped(
					pipe(
						fs.watch(cwd),
						Stream.debounce(Duration.millis(50)),
						Stream.tap(() =>
							Effect.all(
								[
									Effect.flatMap(getStagedDiffs, diffs => SubscriptionRef.set(stagedDiffs, diffs)),
									Effect.flatMap(getUnstagedDiffs, diffs => SubscriptionRef.set(unstagedDiffs, diffs))
								],
								{concurrency: 'unbounded'}
							)
						),
						Stream.runDrain
					)
				)

				return {stagedDiffs, unstagedDiffs}
			}),
			idleTimeToLive: Duration.minutes(5)
		})

		return {
			clone: Effect.fnUntraced(function* ({cwd, directory, url}: {cwd?: string; directory: string; url: string}) {
				const root = cwd ?? (yield* fs.realPath(process.env['HOME'] ?? '/home'))
				const targetDirectory = path.isAbsolute(directory) ? directory : path.join(root, directory)

				yield* pipe(fs.makeDirectory(targetDirectory, {recursive: true}), Effect.ignore)

				yield* pipe(
					execString(
						ChildProcess.make('git', ['clone', '--depth', '1', '--single-branch', url, targetDirectory], {cwd: root})
					),
					Effect.asVoid,
					Effect.catch(() =>
						pipe(
							execString(ChildProcess.make('git', ['-C', targetDirectory, 'pull', '--ff-only'])),
							Effect.asVoid,
							Effect.mapError(
								cause => new GitError({message: `failed to update ${targetDirectory} from ${url}`, cause})
							)
						)
					)
				)
			}),
			createWorktree: Effect.fnUntraced(function* ({
				baseBranch,
				branch,
				cwd,
				directory
			}: {
				baseBranch: string
				branch: string
				cwd: string
				directory: string
			}) {
				const targetDirectory = path.isAbsolute(directory) ? directory : path.join(cwd, directory)

				yield* pipe(execGitString(cwd, ['worktree', 'add', '-b', branch, targetDirectory, baseBranch]), Effect.asVoid)
			}),
			deleteWorktree: Effect.fnUntraced(function* ({cwd, force}: {cwd: string; force?: boolean}) {
				yield* pipe(execGitString(cwd, ['worktree', 'remove', ...(force ? ['--force'] : []), cwd]), Effect.asVoid)
			}),
			invalidateWorktree: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				yield* RcMap.invalidate(worktrees, cwd)
			}),
			listWorktrees: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				const gitDirectory = yield* getGitDirectory(cwd)
				const lines = yield* execGitLines(cwd, ['worktree', 'list', '--porcelain'])
				const worktrees = []
				let currentRoot = ''
				let currentCommit = ''
				let currentBranch: string | undefined

				for (const line of lines) {
					if (pipe(line, String.startsWith('worktree '))) {
						if (currentRoot !== '' && currentCommit !== '') {
							worktrees.push(
								new GitWorktree({branch: currentBranch, commit: currentCommit, gitDirectory, root: currentRoot})
							)
						}

						currentRoot = pipe(line, String.replace(/^worktree\s+/, ''))
						currentCommit = ''
						currentBranch = undefined
						continue
					}

					if (pipe(line, String.startsWith('HEAD '))) {
						currentCommit = pipe(line, String.replace(/^HEAD\s+/, ''))
						continue
					}

					if (pipe(line, String.startsWith('branch refs/heads/'))) {
						currentBranch = pipe(line, String.replace(/^branch\s+refs\/heads\//, ''))
					}
				}

				if (currentRoot !== '' && currentCommit !== '') {
					worktrees.push(
						new GitWorktree({branch: currentBranch, commit: currentCommit, gitDirectory, root: currentRoot})
					)
				}

				return worktrees
			}),
			listRepositoriesFrom: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				const roots = [
					yield* pipe(
						fs.realPath(cwd),
						Effect.orElseSucceed(() => cwd)
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
			stageFile: Effect.fnUntraced(function* ({cwd, filePath}: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(cwd, ['add', '--', filePath]), Effect.asVoid)
			}),
			stagedDiffs: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				return yield* pipe(
					RcMap.get(worktrees, cwd),
					Effect.scoped,
					Effect.flatMap(state => SubscriptionRef.get(state.stagedDiffs))
				)
			}),
			stagedDiffsRef: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				return yield* pipe(
					RcMap.get(worktrees, cwd),
					Effect.scoped,
					Effect.map(state => state.stagedDiffs)
				)
			}),
			unstageFile: Effect.fnUntraced(function* ({cwd, filePath}: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(cwd, ['reset', 'HEAD', '--', filePath]), Effect.asVoid)
			}),
			discardFile: Effect.fnUntraced(function* ({cwd, filePath}: {cwd: string; filePath: string}) {
				yield* pipe(execGitString(cwd, ['restore', '--worktree', '--source=HEAD', '--', filePath]), Effect.asVoid)
			}),
			unstagedDiffs: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				return yield* pipe(
					RcMap.get(worktrees, cwd),
					Effect.scoped,
					Effect.flatMap(state => SubscriptionRef.get(state.unstagedDiffs))
				)
			}),
			unstagedDiffsRef: Effect.fnUntraced(function* ({cwd}: {cwd: string}) {
				return yield* pipe(
					RcMap.get(worktrees, cwd),
					Effect.scoped,
					Effect.map(state => state.unstagedDiffs)
				)
			})
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
