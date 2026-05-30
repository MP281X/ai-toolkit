import {
	Array,
	Context,
	Duration,
	Effect,
	FileSystem,
	Layer,
	Number,
	Option,
	Order,
	Path,
	Random,
	Result,
	Stream,
	String,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {GitReviewFrom, GitReviewTo} from './schema.ts'
import {
	GitBranch,
	GitBranchesSnapshot,
	GitCommit,
	GitDiff,
	GitError,
	GitProject,
	GitReviewMetadata,
	GitRepository,
	GitWorktree as GitWorktreeSchema,
	GitWorktreeStatus
} from './schema.ts'

const makeGitExecutor = Effect.gen(function* () {
	const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)

	const lines = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
		return yield* pipe(
			(yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.lines))(
				ChildProcess.make('git', args, {cwd})
			),
			Effect.mapError(cause => new GitError({cause}))
		)
	})

	const string = Effect.fnUntraced(function* (cwd: string, args: readonly string[]) {
		return yield* pipe(
			execString(ChildProcess.make('git', args, {cwd})),
			Effect.mapError(cause => new GitError({cause}))
		)
	})

	return {lines, string}
})

export class GitWorkspace extends Context.Service<GitWorkspace>()('@deslop/git/service/GitWorkspace', {
	make: Effect.gen(function* () {
		const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
		const git = yield* makeGitExecutor
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())

		const getDefaultBranch = Effect.fnUntraced(function* (cwd: string) {
			return yield* pipe(
				git.string(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
				Effect.map(flow(String.trim, String.replace(/^origin\//u, ''))),
				Effect.catchTag('GitError', () =>
					pipe(
						git.string(cwd, ['rev-parse', '--verify', 'main']),
						Effect.as('main'),
						Effect.catchTag('GitError', () => Effect.succeed('master'))
					)
				)
			)
		})

		const getWorktreeStatus = Effect.fnUntraced(function* (cwd: string, branch?: string) {
			const counts = yield* pipe(
				git.string(cwd, ['rev-list', '--left-right', '--count', `origin/${branch ?? ''}...HEAD`]),
				Effect.map(flow(String.trim, String.split(/\s+/u))),
				Effect.orElseSucceed(() => ['0', '0'])
			)
			return new GitWorktreeStatus({
				ahead: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0),
				behind: Option.getOrElse(Number.parse(counts[0]), () => 0),
				dirtyTracked: yield* pipe(
					git.lines(cwd, ['status', '--porcelain', '--untracked-files=no']),
					Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
					Effect.orElseSucceed(() => false)
				),
				unpushedCommits: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0) > 0,
				untracked: yield* pipe(
					git.lines(cwd, ['ls-files', '--others', '--exclude-standard']),
					Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
					Effect.orElseSucceed(() => false)
				)
			})
		})

		const collectRepositoriesFromRoots: (
			roots: readonly string[],
			repositories: readonly Result.Result<GitRepository, void>[]
		) => Effect.Effect<readonly Result.Result<GitRepository, void>[], GitError> = Effect.fnUntraced(
			function* (roots, repositories) {
				return yield* Array.match(roots, {
					onEmpty: () => Effect.succeed(repositories),
					onNonEmpty: roots =>
						pipe(
							fs.readDirectory(roots[0]),
							Effect.orElseSucceed(() => Array.empty<string>()),
							Effect.flatMap(entries => {
								if (Array.contains(entries, '.git')) {
									return pipe(
										git.string(roots[0], ['rev-parse', '--path-format=absolute', '--git-common-dir']),
										Effect.map(String.trim),
										Effect.map(gitDirectory => Result.succeed(new GitRepository({gitDirectory, root: roots[0]}))),
										Effect.orElseSucceed(() => Result.failVoid),
										Effect.flatMap(repository =>
											collectRepositoriesFromRoots(Array.drop(roots, 1), Array.append(repositories, repository))
										)
									)
								}

								return pipe(
									entries,
									Array.filter(
										entry =>
											!(
												new Set<string>(['.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules']).has(
													entry
												) ||
												(String.startsWith('.')(entry) && entry !== '.git')
											)
									),
									Effect.forEach(entry =>
										pipe(
											fs.stat(path.join(roots[0], entry)),
											Effect.map(info => (info.type === 'Directory' ? path.join(roots[0], entry) : '')),
											Effect.orElseSucceed(() => '')
										)
									),
									Effect.flatMap(nextRoots =>
										collectRepositoriesFromRoots(
											pipe(nextRoots, Array.filter(String.isNonEmpty), Array.appendAll(Array.drop(roots, 1))),
											repositories
										)
									)
								)
							})
						)
				})
			}
		)
		const listWorktrees = Effect.fnUntraced(function* (cwd: string) {
			return yield* pipe(
				yield* git.lines(cwd, ['worktree', 'list', '--porcelain']),
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
								currentRoot: String.replace(/^worktree\s+/u, '')(line),
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
								currentBranch: String.replace(/^branch\s+refs\/heads\//u, '')(line),
								currentRoot: state.currentRoot,
								hasCurrentCommit: state.hasCurrentCommit,
								worktrees: state.worktrees
							}
						}

						return state
					}
				),
				state =>
					String.isNonEmpty(state.currentRoot) && state.hasCurrentCommit
						? Array.append(state.worktrees, {branch: state.currentBranch, root: state.currentRoot})
						: state.worktrees,
				Effect.forEach(worktree =>
					pipe(
						getWorktreeStatus(worktree.root, String.isNonEmpty(worktree.branch) ? worktree.branch : undefined),
						Effect.map(
							status =>
								new GitWorktreeSchema({
									branch: String.isNonEmpty(worktree.branch) ? worktree.branch : undefined,
									root: worktree.root,
									status
								})
						)
					)
				)
			)
		})

		const listRepositoriesFrom = Effect.fnUntraced(function* (cwd: string) {
			return yield* pipe(
				fs.realPath(cwd),
				Effect.orElseSucceed(() => cwd),
				Effect.flatMap(root => collectRepositoriesFromRoots([root], Array.empty())),
				Effect.map(repositories =>
					pipe(
						repositories,
						Array.getSuccesses,
						Array.dedupeWith((left, right) => left.gitDirectory === right.gitDirectory)
					)
				)
			)
		})
		const listProjectsFrom = Effect.fnUntraced(function* (cwd: string) {
			return pipe(
				yield* pipe(
					listRepositoriesFrom(cwd),
					Effect.flatMap(
						Effect.forEach(
							repository =>
								Effect.option(
									pipe(
										listWorktrees(repository.root),
										Effect.map(
											discoveredWorktrees =>
												new GitProject({
													repository: new GitRepository({
														gitDirectory: repository.gitDirectory,
														root: discoveredWorktrees[0]?.root ?? repository.root
													}),
													worktrees: Array.sortWith(
														discoveredWorktrees,
														worktree =>
															`${worktree.root === (discoveredWorktrees[0]?.root ?? repository.root) ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
														Order.String
													)
												})
										)
									)
								),
							{concurrency: 'unbounded'}
						)
					)
				),
				Array.getSomes,
				Array.sortWith(project => project.repository.root, Order.String)
			)
		})
		const refreshProjects = Effect.fnUntraced(function* () {
			yield* SubscriptionRef.set(projects, yield* listProjectsFrom(Bun.env['HOME'] ?? process.cwd()))
		})

		yield* refreshProjects()
		yield* Effect.forkScoped(
			pipe(
				fs.watch(Bun.env['HOME'] ?? process.cwd()),
				Stream.debounce(Duration.millis(250)),
				Stream.tap(() => refreshProjects()),
				Stream.runDrain
			)
		)

		return {
			branches: Effect.fnUntraced(function* (cwd: string) {
				return new GitBranchesSnapshot({
					branches: yield* pipe(
						git.lines(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
						Effect.map(Array.map(name => new GitBranch({name, type: 'local'}))),
						Effect.flatMap(localBranches =>
							pipe(
								git.lines(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']),
								Effect.map(lines =>
									pipe(
										lines,
										Array.filter(name => !String.endsWith('/HEAD')(name)),
										Array.map(
											name =>
												new GitBranch({
													name: pipe(String.split('/')(name), Array.drop(1), Array.join('/')),
													remote: String.split('/')(name)[0],
													type: 'remote'
												})
										),
										Array.filter(branch => String.isNonEmpty(branch.name)),
										Array.appendAll(localBranches)
									)
								)
							)
						)
					),
					defaultBranch: yield* getDefaultBranch(cwd)
				})
			}),
			clone: Effect.fnUntraced(function* (input: {
				readonly cwd: string
				readonly directory: string
				readonly url: string
			}) {
				const targetDirectory = path.isAbsolute(input.directory)
					? input.directory
					: path.join(input.cwd, input.directory)

				yield* pipe(fs.makeDirectory(targetDirectory, {recursive: true}), Effect.ignore)

				yield* pipe(
					execString(
						ChildProcess.make('git', ['clone', '--depth', '1', '--single-branch', input.url, targetDirectory], {
							cwd: input.cwd
						})
					),
					Effect.asVoid,
					Effect.catch(() =>
						pipe(
							execString(ChildProcess.make('git', ['-C', targetDirectory, 'pull', '--ff-only'])),
							Effect.asVoid,
							Effect.mapError(
								cause => new GitError({cause, message: `failed to update ${targetDirectory} from ${input.url}`})
							)
						)
					)
				)
			}),
			createWorktree: Effect.fnUntraced(function* (input: {
				readonly baseBranch: string
				readonly branch: string
				readonly cwd: string
				readonly mode: 'existing-local' | 'existing-remote' | 'new-local'
			}) {
				const targetDirectory = path.join(
					Bun.env['HOME'] ?? input.cwd,
					'.deslop',
					'worktrees',
					`${String.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')(path.basename(input.cwd))}-${String.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')(input.branch)}-${yield* Random.nextIntBetween(100_000, 999_999)}`
				)

				yield* pipe(fs.makeDirectory(path.dirname(targetDirectory), {recursive: true}), Effect.ignore)

				if (input.mode === 'existing-local') {
					yield* pipe(git.string(input.cwd, ['worktree', 'add', targetDirectory, input.branch]), Effect.asVoid)
					yield* refreshProjects()
					return targetDirectory
				}

				if (input.mode === 'existing-remote') {
					yield* pipe(git.string(input.cwd, ['fetch', '--all', '--prune']), Effect.ignore)
					yield* pipe(
						git.string(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, input.baseBranch]),
						Effect.asVoid
					)
					yield* refreshProjects()
					return targetDirectory
				}

				yield* pipe(
					git.string(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, input.baseBranch]),
					Effect.asVoid
				)
				yield* refreshProjects()
				return targetDirectory
			}),
			deleteWorktree: Effect.fnUntraced(function* (input: {readonly cwd: string; readonly force: boolean}) {
				const worktree = yield* pipe(
					git.lines(input.cwd, ['worktree', 'list', '--porcelain']),
					Effect.map(lines =>
						pipe(
							lines,
							Array.reduce(
								{branch: '', currentBranch: '', currentRoot: '', found: false, mainRoot: input.cwd},
								(state, line) => {
									if (state.found) return state

									if (String.startsWith('worktree ')(line)) {
										return {
											branch: state.branch,
											currentBranch: '',
											currentRoot: String.replace(/^worktree\s+/u, '')(line),
											found: state.found,
											mainRoot:
												state.mainRoot === input.cwd ? String.replace(/^worktree\s+/u, '')(line) : state.mainRoot
										}
									}

									if (String.startsWith('branch refs/heads/')(line)) {
										return {
											branch:
												state.currentRoot === input.cwd
													? String.replace(/^branch\s+refs\/heads\//u, '')(line)
													: state.branch,
											currentBranch: String.replace(/^branch\s+refs\/heads\//u, '')(line),
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
					)
				)

				yield* pipe(
					git.string(worktree.mainRoot, ['worktree', 'remove', ...(input.force ? ['--force'] : []), input.cwd]),
					Effect.asVoid
				)

				if (worktree.branch !== undefined) {
					yield* pipe(git.string(worktree.mainRoot, ['branch', '-D', worktree.branch]), Effect.ignore)
				}
				yield* refreshProjects()
			}),
			listProjectsFrom,
			listRepositoriesFrom,
			listWorktrees,
			projects
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}

export class GitWorktree extends Context.Service<GitWorktree>()('@deslop/git/service/GitWorktree', {
	make: Effect.fnUntraced(function* (config: {readonly cwd: string}) {
		const git = yield* makeGitExecutor
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path

		const hasWorktreeChanges = Effect.fnUntraced(function* () {
			return yield* pipe(
				git.lines(config.cwd, ['status', '--porcelain']),
				Effect.map(lines => !Array.isReadonlyArrayEmpty(lines))
			)
		})

		const resolveFrom = Effect.fnUntraced(function* (from: GitReviewFrom) {
			if (from.type === 'ref') return from.ref

			return yield* pipe(git.string(config.cwd, ['merge-base', from.base, 'HEAD']), Effect.map(String.trim))
		})

		function toArgs(to: GitReviewTo) {
			return to.type === 'ref' ? [to.ref] : Array.empty<string>()
		}

		function statusFromNameStatus(line: string) {
			if (String.startsWith('A')(line)) return 'added'
			if (String.startsWith('D')(line)) return 'deleted'
			if (String.startsWith('R')(line)) return 'renamed'

			return 'modified'
		}

		function filePathFromNameStatus(line: string) {
			return pipe(line, String.split('\t'), Array.last, Option.getOrUndefined) ?? ''
		}

		const untrackedDiffs = Effect.fnUntraced(function* () {
			return yield* Effect.forEach(
				yield* git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard']),
				filePath =>
					pipe(
						fs.readFileString(path.join(config.cwd, filePath)),
						Effect.orElseSucceed(() => ''),
						Effect.map(
							content =>
								new GitDiff({
									filePath,
									patch: `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${pipe(
										String.split('\n')(content),
										Array.map(line => `+${line}`),
										Array.join('\n')
									)}`,
									status: 'added'
								})
						)
					),
				{concurrency: 'unbounded'}
			)
		})

		const reviewDiffs = Effect.fnUntraced(function* (scope: 'staged-to-worktree' | 'head-to-staged') {
			const args =
				scope === 'head-to-staged'
					? ['diff', '--cached', '--ignore-all-space', '--ignore-blank-lines', '--ignore-cr-at-eol', '--name-status']
					: ['diff', '--ignore-all-space', '--ignore-blank-lines', '--ignore-cr-at-eol', '--name-status']
			const diffs = yield* pipe(
				git.lines(config.cwd, args),
				Effect.flatMap(
					Effect.forEach(
						line =>
							pipe(
								git.string(
									config.cwd,
									Array.appendAll(Array.dropRight(args, 1), [
										'--patch',
										'--find-renames',
										'-U999999',
										'--no-ext-diff',
										'--',
										filePathFromNameStatus(line)
									])
								),
								Effect.map(
									patch =>
										new GitDiff({filePath: filePathFromNameStatus(line), patch, status: statusFromNameStatus(line)})
								)
							),
						{concurrency: 'unbounded'}
					)
				)
			)

			if (scope === 'head-to-staged') return diffs

			return yield* pipe(untrackedDiffs(), Effect.map(Array.appendAll(diffs)))
		})

		const reviewRangeDiffs = Effect.fnUntraced(function* (input: {
			readonly from: GitReviewFrom
			readonly to: GitReviewTo
		}) {
			const from = yield* resolveFrom(input.from)
			const args = [
				'diff',
				from,
				...toArgs(input.to),
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--name-status'
			]
			const diffs = yield* pipe(
				git.lines(config.cwd, args),
				Effect.flatMap(
					Effect.forEach(
						line =>
							pipe(
								git.string(config.cwd, [
									'diff',
									from,
									...toArgs(input.to),
									'--ignore-all-space',
									'--ignore-blank-lines',
									'--ignore-cr-at-eol',
									'--patch',
									'--find-renames',
									'-U999999',
									'--no-ext-diff',
									'--',
									filePathFromNameStatus(line)
								]),
								Effect.map(
									patch =>
										new GitDiff({filePath: filePathFromNameStatus(line), patch, status: statusFromNameStatus(line)})
								)
							),
						{concurrency: 'unbounded'}
					)
				)
			)

			if (input.to.type === 'ref') return diffs

			return yield* pipe(untrackedDiffs(), Effect.map(Array.appendAll(diffs)))
		})

		const suggestBase = Effect.gen(function* () {
			const defaultBranch = yield* pipe(
				git.string(config.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
				Effect.map(flow(String.trim, String.replace(/^origin\//u, 'origin/'))),
				Effect.orElseSucceed(() => 'origin/main')
			)
			const candidates = [defaultBranch, 'origin/main', 'origin/master', 'main', 'master']

			return yield* pipe(
				candidates,
				Effect.findFirst(candidate =>
					pipe(
						git.string(config.cwd, ['rev-parse', '--verify', candidate]),
						Effect.as(true),
						Effect.orElseSucceed(() => false)
					)
				),
				Effect.map(Option.getOrElse(() => 'HEAD'))
			)
		})

		const commits = Effect.fnUntraced(function* (base: string) {
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* pipe(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s%x00%P', `${from}..HEAD`]),
				Effect.map(
					Array.map(line => {
						const parts = String.split('\u0000')(line)
						const subject = parts[2] ?? ''
						return new GitCommit({
							hash: parts[0] ?? '',
							parents: pipe(parts[3] ?? '', String.split(' '), Array.filter(String.isNonEmpty)),
							shortHash: parts[1] ?? '',
							subject,
							wip: String.startsWith('wip: ')(subject)
						})
					})
				)
			)
		})

		return {
			commitAndPush: Effect.fnUntraced(function* (input: {readonly base: string; readonly message: string}) {
				if (yield* hasWorktreeChanges()) {
					return yield* Effect.fail(new GitError({message: 'Create a WIP commit before squashing.'}))
				}

				const oldestWip = pipe(
					yield* commits(input.base),
					Array.filter(commit => commit.wip),
					Array.last,
					Option.getOrUndefined
				)

				if (!oldestWip) {
					return yield* Effect.fail(new GitError({message: 'No WIP commits to squash.'}))
				}

				yield* pipe(git.string(config.cwd, ['reset', '--soft', `${oldestWip.hash}^`]), Effect.asVoid)
				yield* pipe(git.string(config.cwd, ['commit', '-m', input.message]), Effect.asVoid)

				const branch = yield* pipe(git.string(config.cwd, ['branch', '--show-current']), Effect.map(String.trim))
				const hasUpstream = yield* pipe(
					git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
					Effect.as(true),
					Effect.orElseSucceed(() => false)
				)
				yield* pipe(
					hasUpstream ? git.string(config.cwd, ['push']) : git.string(config.cwd, ['push', '-u', 'origin', branch]),
					Effect.asVoid
				)
			}),
			commits,
			createWipCommit: Effect.fnUntraced(function* (message: string) {
				if (!(yield* hasWorktreeChanges())) {
					return yield* Effect.fail(new GitError({message: 'No changes to commit.'}))
				}

				yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
				yield* pipe(git.string(config.cwd, ['commit', '-m', `wip: ${message}`]), Effect.asVoid)
			}),
			discardFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['reset', 'HEAD', '--', filePath]), Effect.ignore)
				yield* pipe(git.string(config.cwd, ['restore', '--worktree', '--source=HEAD', '--', filePath]), Effect.ignore)
				yield* pipe(git.string(config.cwd, ['clean', '-fd', '--', filePath]), Effect.asVoid)
			}),
			metadata: Effect.fnUntraced(function* (input?: {readonly base?: string}) {
				const base = input?.base ?? (yield* suggestBase)

				return new GitReviewMetadata({base, commits: yield* commits(base), dirty: yield* hasWorktreeChanges()})
			}),
			reviewDiffs,
			reviewRangeDiffs,
			stageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['add', '--', filePath]), Effect.asVoid)
			}),
			unstageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['reset', 'HEAD', '--', filePath]), Effect.asVoid)
			}),
			watchReviewDiffs: (scope: 'staged-to-worktree' | 'head-to-staged') =>
				pipe(
					fs.watch(config.cwd),
					Stream.catch(() => Stream.empty),
					Stream.merge(Stream.tick(Duration.millis(250))),
					Stream.debounce(Duration.millis(50)),
					Stream.mapEffect(() =>
						pipe(
							reviewDiffs(scope),
							Effect.catchTag('GitError', () => Effect.succeed(Array.empty()))
						)
					),
					Stream.changesWith(
						(left, right) =>
							Array.length(left) === Array.length(right) &&
							Array.every(
								left,
								(leftDiff, index) =>
									right[index] !== undefined &&
									leftDiff.filePath === right[index].filePath &&
									leftDiff.status === right[index].status &&
									leftDiff.patch === right[index].patch
							)
					)
				),
			watchReviewRangeDiffs: (input: {readonly from: GitReviewFrom; readonly to: GitReviewTo}) =>
				pipe(
					fs.watch(config.cwd),
					Stream.catch(() => Stream.empty),
					Stream.merge(Stream.tick(Duration.millis(250))),
					Stream.debounce(Duration.millis(50)),
					Stream.mapEffect(() =>
						pipe(
							reviewRangeDiffs(input),
							Effect.catchTag('GitError', () => Effect.succeed(Array.empty()))
						)
					),
					Stream.changesWith(
						(left, right) =>
							Array.length(left) === Array.length(right) &&
							Array.every(
								left,
								(leftDiff, index) =>
									right[index] !== undefined &&
									leftDiff.filePath === right[index].filePath &&
									leftDiff.status === right[index].status &&
									leftDiff.patch === right[index].patch
							)
					)
				)
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
