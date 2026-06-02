import * as NodeFs from 'node:fs'

import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	FileSystem,
	HashMap,
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
	GitDiffSegment,
	GitError,
	GitHubReviewThread,
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
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(process.cwd()))
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())
		const run = Effect.runForkWith(yield* Effect.context<ChildProcessSpawner.ChildProcessSpawner>())

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
			yield* SubscriptionRef.set(projects, yield* listProjectsFrom(home))
		})

		yield* refreshProjects()
		yield* Effect.acquireRelease(
			Effect.sync(() => NodeFs.watch(home, () => run(refreshProjects()))),
			watcher => Effect.sync(() => watcher.close())
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
					home,
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
		const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
		const git = yield* makeGitExecutor
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path

		const hasWorktreeChanges = pipe(
			git.lines(config.cwd, ['status', '--porcelain']),
			Effect.map(lines => !Array.isReadonlyArrayEmpty(lines))
		)

		const resolveFrom = Effect.fnUntraced(function* (from: GitReviewFrom) {
			if (from.type === 'ref') return from.ref

			return yield* pipe(git.string(config.cwd, ['merge-base', from.base, 'HEAD']), Effect.map(String.trim))
		})

		function toArgs(to: GitReviewTo) {
			return to.type === 'ref' ? [to.ref] : Array.empty<string>()
		}

		function segmentsByFile(segments: readonly GitDiffSegment[]) {
			return Array.reduce(segments, HashMap.empty<string, readonly GitDiffSegment[]>(), (groups, segment) =>
				HashMap.modifyAt(groups, segment.filePath, current =>
					Option.some(
						Array.append(
							Option.getOrElse(current, () => Array.empty<GitDiffSegment>()),
							segment
						)
					)
				)
			)
		}

		function diffFromPatchChunk(chunk: string, segments: HashMap.HashMap<string, readonly GitDiffSegment[]>) {
			const deleted = /^deleted file mode /mu.test(chunk)
			const filePath =
				(deleted ? chunk.match(/^--- a\/(.+)$/mu)?.[1] : undefined) ??
				chunk.match(/^\+\+\+ b\/(.+)$/mu)?.[1] ??
				chunk.match(/^--- a\/(.+)$/mu)?.[1] ??
				chunk.match(/^diff --git a\/.+ b\/(.+)$/mu)?.[1] ??
				''
			const status = /^new file mode /mu.test(chunk)
				? 'added'
				: deleted
					? 'deleted'
					: /^rename (from|to) /mu.test(chunk)
						? 'renamed'
						: 'modified'

			return new GitDiff({
				filePath,
				patch: chunk,
				segments: Option.getOrElse(HashMap.get(segments, filePath), () => Array.empty()),
				status
			})
		}

		function diffsFromPatch(patch: string, segments: readonly GitDiffSegment[]) {
			const groupedSegments = segmentsByFile(segments)

			return pipe(
				patch.split(/(?=^diff --git )/mu),
				Array.filter(String.isNonEmpty),
				Array.map(chunk => diffFromPatchChunk(chunk, groupedSegments))
			)
		}

		function attachSegments(diffs: readonly GitDiff[], segments: readonly GitDiffSegment[]) {
			const groupedSegments = segmentsByFile(segments)

			return Array.map(
				diffs,
				diff =>
					new GitDiff({
						filePath: diff.filePath,
						patch: diff.patch,
						segments: Option.getOrElse(HashMap.get(groupedSegments, diff.filePath), () => Array.empty()),
						status: diff.status
					})
			)
		}

		const gitDiffs = Effect.fnUntraced(function* (input: {
			readonly args: readonly string[]
			readonly segments: readonly GitDiffSegment[]
		}) {
			const patch = yield* git.string(config.cwd, [
				'diff',
				...input.args,
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--patch',
				'--find-renames',
				'-U999999',
				'--no-ext-diff'
			])

			return diffsFromPatch(patch, input.segments)
		})

		const untrackedDiffs = pipe(
			git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard']),
			Effect.flatMap(files =>
				Effect.forEach(
					files,
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
										segments: [
											new GitDiffSegment({filePath, fingerprint: content, id: 'HEAD->worktree', type: 'worktree'})
										],
										status: 'added'
									})
							)
						),
					{concurrency: 'unbounded'}
				)
			)
		)

		const commitSegmentDiffs = Effect.fnUntraced(function* (input: {readonly from: string; readonly to: string}) {
			const log = yield* git.string(config.cwd, [
				'log',
				'--reverse',
				'--format=%x00DESLOP-COMMIT%x00%H%x00%P',
				'--find-renames',
				'--name-only',
				`${input.from}..${input.to}`
			])

			return pipe(
				log.split('\u0000DESLOP-COMMIT\u0000'),
				Array.filter(String.isNonEmpty),
				Array.flatMap(entry => {
					const lines = String.split('\n')(entry)
					const header = lines[0] ?? ''
					const parts = String.split('\u0000')(header)
					const commit = parts[0] ?? ''
					const parent = pipe(parts[1] ?? '', String.split(' '), Array.filter(String.isNonEmpty))[0] ?? `${commit}^`
					const id = `${parent}->${commit}`

					return pipe(
						Array.drop(lines, 1),
						Array.filter(String.isNonEmpty),
						Array.map(filePath => new GitDiffSegment({filePath, fingerprint: `${id}:${filePath}`, id, type: 'commit'}))
					)
				})
			)
		})

		const reviewRangeDiffs = Effect.fnUntraced(function* (input: {
			readonly from: GitReviewFrom
			readonly to: GitReviewTo
		}) {
			const from = yield* resolveFrom(input.from)
			const to = input.to.type === 'ref' ? input.to.ref : 'HEAD'

			if (from === 'HEAD' && input.to.type === 'worktree') {
				const trackedDiffs = yield* gitDiffs({args: ['HEAD'], segments: Array.empty()})
				const diffs = pipe(
					trackedDiffs,
					Array.map(diff => {
						const segment = new GitDiffSegment({
							filePath: diff.filePath,
							fingerprint: diff.patch,
							id: 'HEAD->worktree',
							type: 'worktree'
						})

						return new GitDiff({filePath: diff.filePath, patch: diff.patch, segments: [segment], status: diff.status})
					})
				)

				return yield* pipe(untrackedDiffs, Effect.map(Array.appendAll(diffs)))
			}

			const [commitSegments, trackedWorktreeDiffs, untracked, diffs] = yield* Effect.all(
				[
					commitSegmentDiffs({from, to}),
					input.to.type === 'worktree'
						? gitDiffs({args: ['HEAD'], segments: Array.empty()})
						: Effect.succeed(Array.empty<GitDiff>()),
					input.to.type === 'worktree' ? untrackedDiffs : Effect.succeed(Array.empty<GitDiff>()),
					gitDiffs({args: [from, ...toArgs(input.to)], segments: Array.empty()})
				],
				{concurrency: 'unbounded'}
			)
			const worktreeSegments = pipe(
				trackedWorktreeDiffs,
				Array.map(
					diff =>
						new GitDiffSegment({
							filePath: diff.filePath,
							fingerprint: diff.patch,
							id: 'HEAD->worktree',
							type: 'worktree'
						})
				),
				Array.appendAll(Array.flatMap(untracked, diff => diff.segments))
			)
			const segments = Array.appendAll(commitSegments, worktreeSegments)
			const diffsWithSegments = attachSegments(diffs, segments)

			if (input.to.type === 'ref') return diffsWithSegments

			return Array.appendAll(diffsWithSegments, untracked)
		})

		const ghString = Effect.fnUntraced(function* (args: readonly string[]) {
			return yield* pipe(
				execString(ChildProcess.make('gh', args, {cwd: config.cwd})),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const currentBranch = pipe(git.string(config.cwd, ['branch', '--show-current']), Effect.map(String.trim))

		const defaultBranchName = pipe(
			git.string(config.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
			Effect.map(flow(String.trim, String.replace(/^origin\//u, ''))),
			Effect.catchTag('GitError', () =>
				pipe(
					git.string(config.cwd, ['rev-parse', '--verify', 'main']),
					Effect.as('main'),
					Effect.catchTag('GitError', () => Effect.succeed('master'))
				)
			)
		)

		const branchBase = Effect.fnUntraced(function* (defaultBranch: string) {
			return yield* pipe(
				[`origin/${defaultBranch}`, defaultBranch],
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

		const branchPrUrl = pipe(
			ghString(['pr', 'view', '--json', 'url', '--jq', '.url']),
			Effect.map(String.trim),
			Effect.map(url => (String.isNonEmpty(url) ? Option.some(url) : Option.none<string>())),
			Effect.catchTag('GitError', () => Effect.succeed(Option.none<string>()))
		)

		function isWipSubject(subject: string) {
			return subject === 'wip' || String.startsWith('wip: ')(subject)
		}

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
							wip: isWipSubject(subject)
						})
					})
				)
			)
		})

		const firstParentCommits = pipe(
			git.lines(config.cwd, ['log', '--first-parent', '--max-count=80', '--format=%H%x00%h%x00%s%x00%P', 'HEAD']),
			Effect.map(
				Array.map(line => {
					const parts = String.split('\u0000')(line)
					const subject = parts[2] ?? ''
					return new GitCommit({
						hash: parts[0] ?? '',
						parents: pipe(parts[3] ?? '', String.split(' '), Array.filter(String.isNonEmpty)),
						shortHash: parts[1] ?? '',
						subject,
						wip: isWipSubject(subject)
					})
				})
			)
		)

		const pushCurrentBranch = Effect.gen(function* () {
			const branch = yield* currentBranch
			yield* pipe(git.string(config.cwd, ['push', '-u', 'origin', `HEAD:${branch}`]), Effect.asVoid)
		})

		const unpushedCommitSubjects = Effect.gen(function* () {
			const branch = yield* currentBranch
			const remoteBranch = `origin/${branch}`
			const hasRemoteBranch = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--verify', remoteBranch]),
				Effect.as(true),
				Effect.orElseSucceed(() => false)
			)

			if (hasRemoteBranch) {
				return yield* git.lines(config.cwd, ['log', '--format=%s', `${remoteBranch}..HEAD`])
			}

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* git.lines(config.cwd, ['log', '--format=%s', `${from}..HEAD`])
		})

		const hasPushableCommits = pipe(
			unpushedCommitSubjects,
			Effect.map(subjects => !Array.some(subjects, isWipSubject) && !Array.isReadonlyArrayEmpty(subjects))
		)

		const createDraftPr = pipe(
			ghString(['pr', 'create', '--draft', '--fill']),
			Effect.map(output => {
				const url = output.match(/https?:\/\/\S+/u)?.[0] ?? String.trim(output)
				return String.isNonEmpty(url) ? Option.some(url) : Option.none<string>()
			})
		)

		const prReviewThreads = Effect.gen(function* () {
			const pr = yield* pipe(
				ghString(['pr', 'view', '--json', 'number', '--jq', '.number']),
				Effect.map(flow(String.trim, Number.parse)),
				Effect.flatMap(Option.match({onNone: () => new GitError({message: 'No PR found.'}), onSome: Effect.succeed}))
			)
			const repository = yield* pipe(
				ghString(['repo', 'view', '--json', 'owner,name']),
				Effect.map(output => JSON.parse(output) as {readonly name: string; readonly owner: {readonly login: string}})
			)
			const query = `
				query($owner: String!, $name: String!, $number: Int!) {
					repository(owner: $owner, name: $name) {
						pullRequest(number: $number) {
							reviewThreads(first: 100) {
								nodes {
									id
									isResolved
									comments(first: 20) {
										nodes {
											body
											line
											originalLine
											path
											url
										}
									}
								}
							}
						}
					}
				}`
			const response = yield* ghString([
				'api',
				'graphql',
				'-f',
				`query=${query}`,
				'-f',
				`owner=${repository.owner.login}`,
				'-f',
				`name=${repository.name}`,
				'-F',
				`number=${pr}`
			])
			const data = JSON.parse(response) as {
				readonly data?: {
					readonly repository?: {
						readonly pullRequest?: {
							readonly reviewThreads?: {
								readonly nodes?: readonly {
									readonly comments?: {
										readonly nodes?: readonly {
											readonly body?: string
											readonly line?: number
											readonly originalLine?: number
											readonly path?: string
											readonly url?: string
										}[]
									}
									readonly id?: string
									readonly isResolved?: boolean
								}[]
							}
						}
					}
				}
			}
			const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []

			return pipe(
				threads,
				Array.filter(thread => thread.id !== undefined),
				Array.flatMap(thread =>
					pipe(
						thread.comments?.nodes ?? [],
						Array.filter(comment => comment.body !== undefined && comment.path !== undefined),
						Array.map(
							comment =>
								new GitHubReviewThread({
									body: comment.body ?? '',
									filePath: comment.path ?? '',
									id: thread.id ?? '',
									lineNumber: comment.line ?? comment.originalLine ?? 1,
									resolved: thread.isResolved === true,
									url: comment.url
								})
						)
					)
				)
			)
		})

		const worktreeChanges = pipe(
			Stream.make(void 0),
			Stream.merge(
				pipe(
					fs.watch(config.cwd),
					Stream.catch(() => Stream.empty),
					Stream.map(() => undefined)
				)
			),
			Stream.debounce(Duration.millis(50))
		)

		return {
			commitAndPush: Effect.fnUntraced(function* (input: {readonly base: string; readonly message: string}) {
				const oldestWip = pipe(
					yield* commits(input.base),
					Array.takeWhile(commit => commit.wip),
					Array.last,
					Option.getOrUndefined
				)
				const dirty = yield* hasWorktreeChanges

				if (oldestWip) {
					yield* pipe(git.string(config.cwd, ['reset', '--soft', `${oldestWip.hash}^`]), Effect.asVoid)
				} else if (!dirty) {
					return yield* new GitError({message: 'No changes to commit.'})
				}

				yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
				yield* pipe(git.string(config.cwd, ['commit', '-m', input.message]), Effect.asVoid)
				yield* pushCurrentBranch
				if (yield* hasPushableCommits) {
					return yield* new GitError({message: 'Push completed but the branch still has unpushed commits.'})
				}

				const branch = yield* currentBranch
				const defaultBranch = yield* defaultBranchName
				if (branch !== defaultBranch && Option.isNone(yield* branchPrUrl)) {
					yield* createDraftPr
				}
			}),
			commits,
			createWipCommit: Effect.fnUntraced(function* (message: string) {
				if (!(yield* hasWorktreeChanges)) {
					return yield* new GitError({message: 'No changes to commit.'})
				}

				yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
				const subject = pipe(message, String.trim, message => (String.isEmpty(message) ? 'wip' : `wip: ${message}`))
				yield* pipe(git.string(config.cwd, ['commit', '-m', subject]), Effect.asVoid)
			}),
			discardFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['reset', 'HEAD', '--', filePath]), Effect.ignore)
				yield* pipe(git.string(config.cwd, ['restore', '--worktree', '--source=HEAD', '--', filePath]), Effect.ignore)
				yield* pipe(git.string(config.cwd, ['clean', '-fd', '--', filePath]), Effect.asVoid)
			}),
			metadata: Effect.fnUntraced(function* (input?: {readonly base?: string}) {
				const branch = yield* currentBranch
				const defaultBranch = yield* defaultBranchName
				const base = input?.base ?? (yield* branchBase(defaultBranch))
				const displayCommits = branch === defaultBranch ? yield* firstParentCommits : yield* commits(base)

				return new GitReviewMetadata({
					base,
					branch,
					commits: displayCommits,
					defaultBranch,
					dirty: yield* hasWorktreeChanges,
					prUrl: Option.getOrUndefined(yield* branchPrUrl),
					unpushedCommits: yield* hasPushableCommits
				})
			}),
			resolveReviewThread: Effect.fnUntraced(function* (threadId: string) {
				const query = `
					mutation($threadId: ID!) {
						resolveReviewThread(input: {threadId: $threadId}) {
							thread {
								id
							}
						}
					}`
				yield* pipe(ghString(['api', 'graphql', '-f', `query=${query}`, '-f', `threadId=${threadId}`]), Effect.asVoid)
			}),
			reviewRangeDiffs,
			reviewThreads: pipe(
				prReviewThreads,
				Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitHubReviewThread>()))
			),
			stageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['add', '--', filePath]), Effect.asVoid)
			}),
			unstageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(git.string(config.cwd, ['reset', 'HEAD', '--', filePath]), Effect.asVoid)
			}),
			watchReviewRangeDiffs: (input: {readonly from: GitReviewFrom; readonly to: GitReviewTo}) =>
				pipe(
					worktreeChanges,
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
