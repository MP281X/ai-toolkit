import {
	Array,
	Context,
	Duration,
	Effect,
	FileSystem,
	Layer,
	Match,
	Number,
	Option,
	Path,
	pipe,
	Random,
	Result,
	Stream,
	String
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {GitBranch, GitDiff, GitError, GitRepository, GitWorktree, GitWorktreeStatus} from './schema.ts'

export class Git extends Context.Service<Git>()('@ai-toolkit/git/service/Git', {
	make: Effect.gen(function* () {
		const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path

		const execGitLines = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
			return yield* pipe(
				(yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.lines))(
					ChildProcess.make('git', args, {cwd})
				),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const execGitString = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
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
				Effect.map(value => pipe(value, String.trim, String.replace(RegExp('^origin/'), ''))),
				Effect.catchTag('GitError', () => {
					return pipe(
						execGitString(cwd, ['rev-parse', '--verify', 'main']),
						Effect.as('main'),
						Effect.catchTag('GitError', () => Effect.succeed('master'))
					)
				})
			)
		})

		const getWorktreeStatus = Effect.fnUntraced(function* (cwd: string, branch?: string) {
			const counts = yield* pipe(
				execGitString(cwd, ['rev-list', '--left-right', '--count', `origin/${branch ?? ''}...HEAD`]),
				Effect.map(value => pipe(value, String.trim, String.split(RegExp('\\s+')))),
				Effect.orElseSucceed(() => ['0', '0'])
			)
			const ahead = Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0)

			return new GitWorktreeStatus({
				ahead,
				behind: Option.getOrElse(Number.parse(counts[0]), () => 0),
				dirtyTracked: yield* pipe(
					execGitLines(cwd, ['status', '--porcelain', '--untracked-files=no']),
					Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
					Effect.orElseSucceed(() => false)
				),
				unpushedCommits: ahead > 0,
				untracked: yield* pipe(
					execGitLines(cwd, ['ls-files', '--others', '--exclude-standard']),
					Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
					Effect.orElseSucceed(() => false)
				)
			})
		})

		const getDiffs = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
			return yield* pipe(
				execGitLines(cwd, args),
				Effect.flatMap(
					Effect.forEach(
						line => {
							return pipe(
								execGitString(
									cwd,
									pipe(
										args,
										Array.dropRight(1),
										Array.appendAll([
											'--patch',
											'--find-renames',
											'-U999999',
											'--no-ext-diff',
											'--',
											pipe(line, String.split('\t'), Array.last, Option.getOrUndefined) ?? ''
										])
									)
								),
								Effect.map(patch => {
									return new GitDiff({
										filePath: pipe(line, String.split('\t'), Array.last, Option.getOrUndefined) ?? '',
										patch,
										status: pipe(
											Match.value(line),
											Match.when(String.startsWith('A'), () => 'added' as const),
											Match.when(String.startsWith('D'), () => 'deleted' as const),
											Match.when(String.startsWith('R'), () => 'renamed' as const),
											Match.orElse(() => 'modified' as const)
										)
									})
								})
							)
						},
						{concurrency: 'unbounded'}
					)
				)
			)
		})

		const getUntrackedDiffs = Effect.fnUntraced(function* (cwd: string) {
			return yield* Effect.forEach(
				yield* execGitLines(cwd, ['ls-files', '--others', '--exclude-standard']),
				filePath => {
					return pipe(
						fs.readFileString(path.join(cwd, filePath)),
						Effect.orElseSucceed(() => ''),
						Effect.map(content => {
							const lines = pipe(
								String.split('\n')(content),
								Array.map(line => `+${line}`),
								Array.join('\n')
							)

							return new GitDiff({
								filePath,
								patch: `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${lines}`,
								status: 'added'
							})
						})
					)
				},
				{concurrency: 'unbounded'}
			)
		})

		const reviewDiffs = Effect.fnUntraced(function* (input: {
			readonly cwd: string
			readonly scope: 'staged-to-worktree' | 'head-to-staged'
		}) {
			const diffs = yield* getDiffs(
				input.cwd,
				input.scope === 'head-to-staged' ? ['diff', '--cached', '--name-status'] : ['diff', '--name-status']
			)

			if (input.scope === 'head-to-staged') return diffs

			return yield* pipe(getUntrackedDiffs(input.cwd), Effect.map(Array.appendAll(diffs)))
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
		const collectRepositoriesFromRoots: (
			roots: readonly string[],
			repositories: readonly Result.Result<GitRepository, void>[]
		) => Effect.Effect<readonly Result.Result<GitRepository, void>[], GitError> = Effect.fnUntraced(
			function* (roots, repositories) {
				return yield* Array.match(roots, {
					onEmpty: () => Effect.succeed(repositories),
					onNonEmpty: roots => {
						return pipe(
							fs.readDirectory(roots[0]),
							Effect.orElseSucceed(() => Array.empty<string>()),
							Effect.flatMap(entries => {
								if (Array.contains(entries, '.git')) {
									return pipe(
										getGitDirectory(roots[0]),
										Effect.map(gitDirectory => Result.succeed(new GitRepository({gitDirectory, root: roots[0]}))),
										Effect.orElseSucceed(() => Result.failVoid),
										Effect.flatMap(repository => {
											return collectRepositoriesFromRoots(Array.drop(roots, 1), Array.append(repositories, repository))
										})
									)
								}

								return pipe(
									entries,
									Array.filter(
										entry => !(ignoredDirectoryNames.has(entry) || (String.startsWith('.')(entry) && entry !== '.git'))
									),
									Effect.forEach(entry => {
										return pipe(
											fs.stat(path.join(roots[0], entry)),
											Effect.map(info => (info.type === 'Directory' ? path.join(roots[0], entry) : '')),
											Effect.orElseSucceed(() => '')
										)
									}),
									Effect.flatMap(nextRoots => {
										return collectRepositoriesFromRoots(
											pipe(nextRoots, Array.filter(String.isNonEmpty), Array.appendAll(Array.drop(roots, 1))),
											repositories
										)
									})
								)
							})
						)
					}
				})
			}
		)

		return {
			clone: Effect.fnUntraced(function* (input: {
				readonly cwd?: string
				readonly directory: string
				readonly url: string
			}) {
				const targetDirectory = path.isAbsolute(input.directory)
					? input.directory
					: path.join(input.cwd ?? (yield* fs.realPath(process.env['HOME'] ?? '/home')), input.directory)

				yield* pipe(fs.makeDirectory(targetDirectory, {recursive: true}), Effect.ignore)

				yield* pipe(
					fs.realPath(process.env['HOME'] ?? '/home'),
					Effect.orElseSucceed(() => '/home'),
					Effect.flatMap(homeRoot => {
						return execString(
							ChildProcess.make('git', ['clone', '--depth', '1', '--single-branch', input.url, targetDirectory], {
								cwd: input.cwd ?? homeRoot
							})
						)
					}),
					Effect.asVoid,
					Effect.catch(() => {
						return pipe(
							execString(ChildProcess.make('git', ['-C', targetDirectory, 'pull', '--ff-only'])),
							Effect.asVoid,
							Effect.mapError(
								cause => new GitError({message: `failed to update ${targetDirectory} from ${input.url}`, cause})
							)
						)
					})
				)
			}),
			branches: Effect.fnUntraced(function* (input: {readonly cwd: string}) {
				return {
					branches: yield* pipe(
						execGitLines(input.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
						Effect.map(Array.map(name => new GitBranch({name, type: 'local'}))),
						Effect.flatMap(localBranches => {
							return pipe(
								execGitLines(input.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']),
								Effect.map(lines => {
									return pipe(
										lines,
										Array.filter(name => !String.endsWith('/HEAD')(name)),
										Array.map(name => {
											return new GitBranch({
												name: pipe(String.split('/')(name), Array.drop(1), Array.join('/')),
												remote: String.split('/')(name)[0],
												type: 'remote'
											})
										}),
										Array.filter(branch => String.isNonEmpty(branch.name)),
										Array.appendAll(localBranches)
									)
								})
							)
						})
					),
					defaultBranch: yield* getDefaultBranch(input.cwd)
				}
			}),
			createWorktree: Effect.fnUntraced(function* (input: {
				readonly baseBranch: string
				readonly branch: string
				readonly cwd: string
				readonly mode: 'existing-local' | 'existing-remote' | 'new-local'
			}) {
				const targetDirectory = path.join(
					process.env['HOME'] ?? input.cwd,
					'.ai-toolkit',
					'worktrees',
					`${String.replace(RegExp('[^a-zA-Z0-9._-]+', 'g'), '-')(path.basename(input.cwd))}-${String.replace(RegExp('[^a-zA-Z0-9._-]+', 'g'), '-')(input.branch)}-${yield* Random.nextIntBetween(100_000, 999_999)}`
				)

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
			deleteWorktree: Effect.fnUntraced(function* (input: {readonly cwd: string; readonly force: boolean}) {
				const worktree = yield* pipe(
					execGitLines(input.cwd, ['worktree', 'list', '--porcelain']),
					Effect.map(lines => {
						return pipe(
							lines,
							Array.reduce(
								{branch: '', currentBranch: '', currentRoot: '', found: false, mainRoot: input.cwd},
								(state, line) => {
									if (state.found) return state

									if (String.startsWith('worktree ')(line)) {
										return {
											branch: state.branch,
											currentBranch: '',
											currentRoot: String.replace(RegExp('^worktree\\s+'), '')(line),
											found: state.found,
											mainRoot:
												state.mainRoot === input.cwd
													? String.replace(RegExp('^worktree\\s+'), '')(line)
													: state.mainRoot
										}
									}

									if (String.startsWith('branch refs/heads/')(line)) {
										return {
											branch:
												state.currentRoot === input.cwd
													? String.replace(RegExp('^branch\\s+refs/heads/'), '')(line)
													: state.branch,
											currentBranch: String.replace(RegExp('^branch\\s+refs/heads/'), '')(line),
											currentRoot: state.currentRoot,
											found: state.currentRoot === input.cwd,
											mainRoot: state.mainRoot
										}
									}

									return state
								}
							),
							state => ({branch: String.isNonEmpty(state.branch) ? state.branch : undefined, mainRoot: state.mainRoot})
						)
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
			listWorktrees: Effect.fnUntraced(function* (input: {readonly cwd: string}) {
				const lines = yield* execGitLines(input.cwd, ['worktree', 'list', '--porcelain'])

				return yield* pipe(
					lines,
					Array.reduce(
						{
							currentBranch: '',
							currentRoot: '',
							hasCurrentCommit: false,
							worktrees: Array.empty<{readonly branch: string; readonly root: string}>()
						},
						(state, line) => {
							if (String.startsWith('worktree ')(line)) {
								return {
									currentBranch: '',
									currentRoot: String.replace(RegExp('^worktree\\s+'), '')(line),
									hasCurrentCommit: false,
									worktrees:
										String.isNonEmpty(state.currentRoot) && state.hasCurrentCommit
											? Array.append(state.worktrees, {branch: state.currentBranch, root: state.currentRoot})
											: state.worktrees
								}
							}

							if (String.startsWith('HEAD ')(line)) {
								return {
									currentBranch: state.currentBranch,
									currentRoot: state.currentRoot,
									hasCurrentCommit: true,
									worktrees: state.worktrees
								}
							}

							if (String.startsWith('branch refs/heads/')(line)) {
								return {
									currentBranch: String.replace(RegExp('^branch\\s+refs/heads/'), '')(line),
									currentRoot: state.currentRoot,
									hasCurrentCommit: state.hasCurrentCommit,
									worktrees: state.worktrees
								}
							}

							return state
						}
					),
					state => {
						return String.isNonEmpty(state.currentRoot) && state.hasCurrentCommit
							? Array.append(state.worktrees, {branch: state.currentBranch, root: state.currentRoot})
							: state.worktrees
					},
					Effect.forEach(worktree => {
						return pipe(
							getWorktreeStatus(worktree.root, String.isNonEmpty(worktree.branch) ? worktree.branch : undefined),
							Effect.map(status => {
								return new GitWorktree({
									branch: String.isNonEmpty(worktree.branch) ? worktree.branch : undefined,
									root: worktree.root,
									status
								})
							})
						)
					})
				)
			}),
			listRepositoriesFrom: Effect.fnUntraced(function* (input: {readonly cwd: string}) {
				return yield* pipe(
					fs.realPath(input.cwd),
					Effect.orElseSucceed(() => input.cwd),
					Effect.flatMap(root => collectRepositoriesFromRoots([root], Array.empty())),
					Effect.map(repositories => {
						return pipe(
							repositories,
							Array.getSuccesses,
							Array.dedupeWith((left, right) => left.gitDirectory === right.gitDirectory)
						)
					})
				)
			}),
			stageFile: Effect.fnUntraced(function* (input: {readonly cwd: string; readonly filePath: string}) {
				yield* pipe(execGitString(input.cwd, ['add', '--', input.filePath]), Effect.asVoid)
			}),
			reviewDiffs,
			watchReviewDiffs: (input: {readonly cwd: string; readonly scope: 'staged-to-worktree' | 'head-to-staged'}) => {
				return pipe(
					fs.watch(input.cwd),
					Stream.catch(() => Stream.empty),
					Stream.merge(Stream.tick(Duration.millis(250))),
					Stream.debounce(Duration.millis(50)),
					Stream.mapEffect(() => {
						return pipe(
							reviewDiffs(input),
							Effect.catchTag('GitError', () => Effect.succeed(Array.empty()))
						)
					}),
					Stream.changesWith((left, right) => {
						return (
							Array.length(left) === Array.length(right) &&
							Array.every(left, (leftDiff, index) => {
								return (
									right[index] !== undefined &&
									leftDiff.filePath === right[index].filePath &&
									leftDiff.status === right[index].status &&
									leftDiff.patch === right[index].patch
								)
							})
						)
					})
				)
			},
			unstageFile: Effect.fnUntraced(function* (input: {readonly cwd: string; readonly filePath: string}) {
				yield* pipe(execGitString(input.cwd, ['reset', 'HEAD', '--', input.filePath]), Effect.asVoid)
			}),
			discardFile: Effect.fnUntraced(function* (input: {readonly cwd: string; readonly filePath: string}) {
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
