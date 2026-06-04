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
	Match,
	Number,
	Option,
	Order,
	Path,
	Predicate,
	Random,
	Schema,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {GitReviewTarget} from './schema.ts'
import {
	GitBranch,
	GitBranchesSnapshot,
	GitCommit,
	GitDiff,
	GitDiffSegment,
	GitError,
	GitHubRepositoryResponse,
	GitHubReviewThreadsResponse,
	GitHubReviewThread,
	GitProject,
	GitReviewMetadata,
	GitRepository,
	GitWorktree as GitWorktreeSchema,
	GitWorktreeStatus
} from './schema.ts'

export class GitCommand extends Context.Service<GitCommand>()('@deslop/git/service/GitCommand', {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

		const string = Effect.fn('GitCommand.string')(function* (cwd: string, args: readonly string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'git', cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('git', args, {cwd, stderr: 'pipe', stdout: 'pipe'})),
						Effect.mapError(cause => new GitError({cause}))
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* pipe(
						handle.exitCode,
						Effect.mapError(cause => new GitError({cause}))
					)

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `git ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return output.stdout
				})
			).pipe(Effect.withSpan('git.command', {attributes: {command: args[0] ?? 'git', cwd}}))
		})

		return {
			lines: Effect.fn('GitCommand.lines')(function* (cwd: string, args: readonly string[]) {
				return pipe(yield* string(cwd, args), String.split(/\r?\n/u), Array.filter(String.isNonEmpty))
			}),
			string
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}

const excludedDiscoveryEntries = new Set(['.git', 'dist', 'node_modules'])

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
	const status = Match.value(chunk).pipe(
		Match.when(
			value => /^new file mode /mu.test(value),
			() => 'added' as const
		),
		Match.when(
			() => deleted,
			() => 'deleted' as const
		),
		Match.when(
			value => /^rename (from|to) /mu.test(value),
			() => 'renamed' as const
		),
		Match.orElse(() => 'modified' as const)
	)

	return new GitDiff({
		filePath,
		patch: chunk,
		segments: Option.getOrElse(HashMap.get(segments, filePath), () => Array.empty()),
		status
	})
}

function commitFromLogLine(line: string) {
	const parts = String.split('\u0000')(line)

	return new GitCommit({hash: parts[0], shortHash: parts[1] ?? '', subject: parts[2] ?? ''})
}

function parseWorktreeRecords(output: string) {
	const records: {branch?: string; hasHead: boolean; root: string}[] = []
	let current: {branch?: string; hasHead: boolean; root: string} = {hasHead: false, root: ''}

	for (const field of String.split('\u0000')(output)) {
		if (String.startsWith('worktree ')(field)) {
			if (String.isNonEmpty(current.root) && current.hasHead) records.push(current)
			current = {hasHead: false, root: String.replace(/^worktree\s+/u, '')(field)}
		} else if (String.startsWith('HEAD ')(field)) {
			current = {...current, hasHead: true}
		} else if (String.startsWith('branch refs/heads/')(field)) {
			current = {...current, branch: String.replace(/^branch\s+refs\/heads\//u, '')(field)}
		}
	}

	if (String.isNonEmpty(current.root) && current.hasHead) records.push(current)
	return records
}

export class GitWorkspace extends Context.Service<GitWorkspace>()('@deslop/git/service/GitWorkspace', {
	make: Effect.gen(function* () {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(process.cwd()))
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())
		const run = Effect.runForkWith(yield* Effect.context<ChildProcessSpawner.ChildProcessSpawner>())

		const getDefaultBranch = Effect.fn('GitWorkspace.getDefaultBranch')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
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

		const getWorktreeStatus = Effect.fn('GitWorkspace.getWorktreeStatus')(function* (cwd: string, branch?: string) {
			yield* Effect.annotateCurrentSpan({branch: branch ?? '', cwd})
			const counts =
				branch === undefined
					? ['0', '0']
					: yield* pipe(
							git.string(cwd, ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`]),
							Effect.map(flow(String.trim, String.split(/\s+/u))),
							Effect.orElseSucceed(() => ['0', '0'])
						)
			return new GitWorktreeStatus({
				ahead: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0),
				behind: Option.getOrElse(Number.parse(counts[0] ?? '0'), () => 0),
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
			repositories: readonly GitRepository[]
		) => Effect.Effect<readonly GitRepository[], GitError> = Effect.fn('GitWorkspace.collectRepositoriesFromRoots')(
			function* (roots, repositories) {
				yield* Effect.annotateCurrentSpan({repositoryCount: Array.length(repositories), rootCount: Array.length(roots)})
				return yield* Array.match(roots, {
					onEmpty: () => Effect.succeed(repositories),
					onNonEmpty: remainingRoots => {
						const root = remainingRoots[0]

						return pipe(
							fs.readDirectory(root),
							Effect.orElseSucceed(() => Array.empty<string>()),
							Effect.flatMap(entries => {
								if (Array.contains(entries, '.git')) {
									return pipe(
										Effect.all(
											{
												gitDirectory: pipe(
													git.string(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
													Effect.map(String.trim)
												),
												worktrees: pipe(
													git.string(root, ['worktree', 'list', '--porcelain', '-z']),
													Effect.map(parseWorktreeRecords)
												)
											},
											{concurrency: 'unbounded'}
										),
										Effect.map(
											repository =>
												new GitRepository({
													gitDirectory: repository.gitDirectory,
													root: repository.worktrees[0]?.root ?? root
												})
										),
										Effect.option,
										Effect.flatMap(repository =>
											collectRepositoriesFromRoots(
												Array.drop(remainingRoots, 1),
												pipe(
													repository,
													Option.match({onNone: () => repositories, onSome: value => Array.append(repositories, value)})
												)
											)
										)
									)
								}

								return pipe(
									entries,
									Array.filter(
										entry =>
											!excludedDiscoveryEntries.has(entry) && !(String.startsWith('.')(entry) && entry !== '.git')
									),
									Effect.forEach(entry =>
										pipe(
											fs.stat(path.join(root, entry)),
											Effect.map(info => (info.type === 'Directory' ? path.join(root, entry) : '')),
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
					}
				})
			}
		)
		const listWorktrees = Effect.fn('GitWorkspace.listWorktrees')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			const worktrees = yield* pipe(
				git.string(cwd, ['worktree', 'list', '--porcelain', '-z']),
				Effect.flatMap(output =>
					pipe(
						Effect.sync(() => parseWorktreeRecords(output)),
						Effect.withSpan('GitWorkspace.parseWorktrees', {attributes: {cwd}})
					)
				)
			)
			yield* Effect.annotateCurrentSpan({worktreeCount: Array.length(worktrees)})

			return yield* Effect.forEach(worktrees, worktree =>
				pipe(
					getWorktreeStatus(worktree.root, worktree.branch),
					Effect.map(status => new GitWorktreeSchema({branch: worktree.branch, root: worktree.root, status}))
				)
			)
		})

		const listRepositoriesFrom = Effect.fn('GitWorkspace.listRepositoriesFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				fs.realPath(cwd),
				Effect.orElseSucceed(() => cwd),
				Effect.flatMap(root => collectRepositoriesFromRoots([root], Array.empty())),
				Effect.map(repositories =>
					pipe(
						repositories,
						Array.dedupeWith((left, right) => left.gitDirectory === right.gitDirectory || left.root === right.root)
					)
				)
			)
		})
		const listProjectsFrom = Effect.fn('GitWorkspace.listProjectsFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
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
		const refreshProjects = Effect.fn('GitWorkspace.refreshProjects')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: home})
			yield* SubscriptionRef.set(projects, yield* listProjectsFrom(home))
		})
		yield* refreshProjects()
		yield* Effect.acquireRelease(
			Effect.sync(() =>
				NodeFs.watch(home, () => {
					run(refreshProjects())
				})
			),
			watcher =>
				Effect.sync(() => {
					watcher.close()
				})
		)

		return {
			branches: Effect.fn('GitWorkspace.branches')(function* (cwd: string) {
				yield* Effect.annotateCurrentSpan({cwd})
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
			createWorktree: Effect.fn('GitWorkspace.createWorktree')(function* (input: {
				readonly branch: string
				readonly cwd: string
			}) {
				yield* Effect.annotateCurrentSpan({branch: input.branch, cwd: input.cwd})
				const targetDirectory = path.join(
					home,
					'.deslop',
					'worktrees',
					`${String.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')(path.basename(input.cwd))}-${String.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')(input.branch)}-${yield* Random.nextIntBetween(100_000, 999_999)}`
				)

				yield* pipe(fs.makeDirectory(path.dirname(targetDirectory), {recursive: true}), Effect.ignore)

				const localExists = yield* pipe(
					git.string(input.cwd, ['rev-parse', '--verify', input.branch]),
					Effect.as(true),
					Effect.orElseSucceed(() => false)
				)
				if (localExists) {
					yield* Effect.annotateCurrentSpan({source: 'local'})
					yield* pipe(git.string(input.cwd, ['worktree', 'add', targetDirectory, input.branch]), Effect.asVoid)
					yield* refreshProjects()
					return targetDirectory
				}

				const remoteBranch = `origin/${input.branch}`
				const remoteExists = yield* pipe(
					git.string(input.cwd, ['rev-parse', '--verify', remoteBranch]),
					Effect.as(true),
					Effect.orElseSucceed(() => false)
				)
				if (remoteExists) {
					yield* Effect.annotateCurrentSpan({source: 'remote'})
					yield* pipe(
						git.string(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, remoteBranch]),
						Effect.asVoid
					)
					yield* refreshProjects()
					return targetDirectory
				}

				const defaultBranch = yield* getDefaultBranch(input.cwd)
				yield* Effect.annotateCurrentSpan({source: 'new'})
				yield* pipe(
					git.string(input.cwd, ['worktree', 'add', '-b', input.branch, targetDirectory, defaultBranch]),
					Effect.asVoid
				)
				yield* refreshProjects()
				return targetDirectory
			}),
			deleteWorktree: Effect.fn('GitWorkspace.deleteWorktree')(function* (input: {readonly cwd: string}) {
				yield* Effect.annotateCurrentSpan({cwd: input.cwd})
				const worktrees = yield* pipe(
					git.string(input.cwd, ['worktree', 'list', '--porcelain', '-z']),
					Effect.map(parseWorktreeRecords)
				)
				const mainRoot = worktrees[0]?.root ?? input.cwd
				const branch = pipe(
					worktrees,
					Array.findFirst(worktree => worktree.root === input.cwd),
					Option.getOrUndefined
				)?.branch

				yield* pipe(git.string(mainRoot, ['worktree', 'remove', '--force', input.cwd]), Effect.asVoid)

				if (Predicate.isNotUndefined(branch)) {
					yield* pipe(git.string(mainRoot, ['branch', '-D', branch]), Effect.ignore)
				}
				yield* refreshProjects()
			}),
			listProjectsFrom,
			listRepositoriesFrom,
			listWorktrees,
			projects,
			refreshProjects
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}

export class GitMaintenance extends Context.Service<GitMaintenance>()('@deslop/git/service/GitMaintenance', {
	make: Effect.gen(function* () {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(process.cwd()))
		const maintenanceLock = yield* Semaphore.make(1)

		const collectRepositoriesFromRoots: (
			roots: readonly string[],
			repositories: readonly GitRepository[]
		) => Effect.Effect<readonly GitRepository[], GitError> = Effect.fn('GitMaintenance.collectRepositoriesFromRoots')(
			function* (roots, repositories) {
				yield* Effect.annotateCurrentSpan({repositoryCount: Array.length(repositories), rootCount: Array.length(roots)})
				return yield* Array.match(roots, {
					onEmpty: () => Effect.succeed(repositories),
					onNonEmpty: remainingRoots => {
						const root = remainingRoots[0]

						return pipe(
							fs.readDirectory(root),
							Effect.orElseSucceed(() => Array.empty<string>()),
							Effect.flatMap(entries => {
								if (Array.contains(entries, '.git')) {
									return pipe(
										Effect.all(
											{
												gitDirectory: pipe(
													git.string(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
													Effect.map(String.trim)
												),
												worktrees: pipe(
													git.string(root, ['worktree', 'list', '--porcelain', '-z']),
													Effect.map(parseWorktreeRecords)
												)
											},
											{concurrency: 'unbounded'}
										),
										Effect.map(
											repository =>
												new GitRepository({
													gitDirectory: repository.gitDirectory,
													root: repository.worktrees[0]?.root ?? root
												})
										),
										Effect.option,
										Effect.flatMap(repository =>
											collectRepositoriesFromRoots(
												Array.drop(remainingRoots, 1),
												pipe(
													repository,
													Option.match({onNone: () => repositories, onSome: value => Array.append(repositories, value)})
												)
											)
										)
									)
								}

								return pipe(
									entries,
									Array.filter(
										entry =>
											!excludedDiscoveryEntries.has(entry) && !(String.startsWith('.')(entry) && entry !== '.git')
									),
									Effect.forEach(entry =>
										pipe(
											fs.stat(path.join(root, entry)),
											Effect.map(info => (info.type === 'Directory' ? path.join(root, entry) : '')),
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
					}
				})
			}
		)
		const listRepositoriesFrom = Effect.fn('GitMaintenance.listRepositoriesFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				fs.realPath(cwd),
				Effect.orElseSucceed(() => cwd),
				Effect.flatMap(root => collectRepositoriesFromRoots([root], Array.empty())),
				Effect.map(repositories =>
					pipe(
						repositories,
						Array.dedupeWith((left, right) => left.gitDirectory === right.gitDirectory || left.root === right.root)
					)
				)
			)
		})

		const maintain = Effect.fn('GitMaintenance.maintain')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			yield* pipe(
				Effect.gen(function* () {
					const repositories = yield* listRepositoriesFrom(cwd)
					yield* Effect.annotateCurrentSpan({repositoryCount: Array.length(repositories)})

					yield* Effect.forEach(
						repositories,
						repository =>
							Effect.gen(function* () {
								yield* pipe(
									git.string(repository.root, ['fetch', '--all', '--prune']),
									Effect.asVoid,
									Effect.withSpan('GitMaintenance.fetch', {attributes: {cwd: repository.root}})
								)
								const worktrees = parseWorktreeRecords(
									yield* git.string(repository.root, ['worktree', 'list', '--porcelain', '-z'])
								)
								const branchRows = yield* git.lines(repository.root, [
									'for-each-ref',
									'refs/heads',
									'--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(worktreepath)'
								])

								yield* Effect.forEach(
									branchRows,
									row =>
										pipe(
											Effect.gen(function* () {
												const fields = String.split('\u0000')(row)
												const branch = fields[0]
												const upstream = fields[1] ?? ''
												const track = fields[2] ?? ''
												const worktreePath =
													fields[3] ??
													pipe(
														worktrees,
														Array.findFirst(worktree => worktree.branch === branch),
														Option.map(worktree => worktree.root),
														Option.getOrElse(() => '')
													)
												yield* Effect.annotateCurrentSpan({branch, cwd: repository.root})

												if (String.isEmpty(branch)) return

												if (track === '[gone]') {
													if (String.isNonEmpty(worktreePath)) {
														yield* pipe(
															git.string(repository.root, ['worktree', 'remove', '--force', worktreePath]),
															Effect.asVoid,
															Effect.withSpan('GitMaintenance.deleteWorktree', {
																attributes: {branch, cwd: repository.root}
															})
														)
													}
													yield* pipe(
														git.string(repository.root, ['branch', '-D', branch]),
														Effect.asVoid,
														Effect.withSpan('GitMaintenance.deleteBranch', {attributes: {branch, cwd: repository.root}})
													)
													return
												}

												if (
													String.isEmpty(upstream) ||
													!String.includes('behind')(track) ||
													String.includes('ahead')(track)
												) {
													return
												}

												if (String.isNonEmpty(worktreePath)) {
													yield* pipe(
														git.string(worktreePath, ['merge', '--ff-only', upstream]),
														Effect.ignore,
														Effect.withSpan('GitMaintenance.fastForwardWorktree', {
															attributes: {branch, cwd: worktreePath}
														})
													)
													return
												}

												yield* pipe(
													git.string(repository.root, ['merge-base', '--is-ancestor', branch, upstream]),
													Effect.andThen(git.string(repository.root, ['branch', '-f', branch, upstream])),
													Effect.ignore,
													Effect.withSpan('GitMaintenance.fastForwardBranch', {
														attributes: {branch, cwd: repository.root}
													})
												)
											}),
											Effect.withSpan('GitMaintenance.classifyBranch', {attributes: {cwd: repository.root}})
										),
									{concurrency: 'unbounded'}
								)
							}),
						{concurrency: 'unbounded'}
					)
				}),
				Semaphore.withPermit(maintenanceLock)
			)
		})

		yield* pipe(
			maintain(home),
			Effect.ignore,
			Effect.andThen(Effect.sleep(Duration.seconds(180))),
			Effect.forever,
			Effect.forkScoped
		)

		return {maintain}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path

		const hasWorktreeChanges = pipe(
			git.lines(config.cwd, ['status', '--porcelain']),
			Effect.map(lines => !Array.isReadonlyArrayEmpty(lines))
		)

		function diffsFromPatch(patch: string, segments: readonly GitDiffSegment[]) {
			const groupedSegments = segmentsByFile(segments)

			return pipe(
				patch.split(/(?=^diff --git )/mu),
				Array.filter(String.isNonEmpty),
				Array.map(chunk => diffFromPatchChunk(chunk, groupedSegments))
			)
		}

		const gitDiffs = Effect.fn('GitReview.gitDiffs')(function* (input: {
			readonly args: readonly string[]
			readonly segments: readonly GitDiffSegment[]
		}) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, segmentCount: Array.length(input.segments)})
			const patch = yield* git.string(config.cwd, [
				'diff',
				...input.args,
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--patch',
				'--find-renames',
				'--no-ext-diff'
			])

			const diffs = diffsFromPatch(patch, input.segments)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffs)})
			return diffs
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

		const worktreeDiffs = Effect.gen(function* () {
			const status = yield* git.lines(config.cwd, ['status', '--porcelain'])
			if (Array.isReadonlyArrayEmpty(status)) return Array.empty<GitDiff>()

			const diffs = yield* pipe(
				Effect.all([gitDiffs({args: ['HEAD'], segments: Array.empty()}), untrackedDiffs], {concurrency: 'unbounded'}),
				Effect.map(([trackedDiffs, untracked]) =>
					Array.appendAll(
						Array.map(trackedDiffs, diff => {
							const segment = new GitDiffSegment({
								filePath: diff.filePath,
								fingerprint: diff.patch,
								id: 'HEAD->worktree',
								type: 'worktree'
							})

							return new GitDiff({filePath: diff.filePath, patch: diff.patch, segments: [segment], status: diff.status})
						}),
						untracked
					)
				)
			)

			return diffs
		}).pipe(Effect.withSpan('GitReview.worktreeDiffs', {attributes: {cwd: config.cwd}}))

		const fileContent = Effect.fn('GitReview.fileContent')(function* (input: {
			readonly filePath: string
			readonly target: GitReviewTarget
		}) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, filePath: input.filePath, target: input.target._tag})
			if (input.target._tag === 'head') {
				return yield* pipe(
					fs.readFileString(path.join(config.cwd, input.filePath)),
					Effect.orElseSucceed(() => '')
				)
			}

			return yield* pipe(
				git.string(config.cwd, ['show', `${input.target.hash}:${input.filePath}`]),
				Effect.orElseSucceed(() => '')
			)
		})

		const withFileContent = Effect.fn('GitReview.withFileContent')(function* (input: {
			readonly diffs: readonly GitDiff[]
			readonly filePath?: string
			readonly target: GitReviewTarget
		}) {
			if (input.filePath === undefined) return input.diffs

			const content = yield* fileContent({filePath: input.filePath, target: input.target})
			return Array.map(input.diffs, diff =>
				diff.filePath === input.filePath
					? new GitDiff({
							fileContent: content,
							filePath: diff.filePath,
							patch: diff.patch,
							segments: diff.segments,
							status: diff.status
						})
					: diff
			)
		})

		const reviewDiffs = Effect.fn('GitReview.reviewDiffs')(function* (target: GitReviewTarget, filePath?: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, target: target._tag})
			if (target._tag === 'head') return yield* withFileContent({diffs: yield* worktreeDiffs, filePath, target})

			const id = `${target.hash}^->${target.hash}`
			const diffs = yield* gitDiffs({args: [`${target.hash}^`, target.hash], segments: Array.empty()})
			const diffsWithSegments = pipe(
				diffs,
				Array.map(
					diff =>
						new GitDiff({
							filePath: diff.filePath,
							patch: diff.patch,
							segments: [
								new GitDiffSegment({filePath: diff.filePath, fingerprint: `${id}:${diff.filePath}`, id, type: 'commit'})
							],
							status: diff.status
						})
				)
			)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

			return yield* withFileContent({diffs: diffsWithSegments, filePath, target})
		})

		const ghString = Effect.fn('gh.string')(function* (args: readonly string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd: config.cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('gh', args, {cwd: config.cwd, stderr: 'pipe', stdout: 'pipe'})),
						Effect.mapError(cause => new GitError({cause}))
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* pipe(
						handle.exitCode,
						Effect.mapError(cause => new GitError({cause}))
					)

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `gh ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return output.stdout
				})
			).pipe(Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd: config.cwd}}))
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

		const branchBase = Effect.fn('GitReview.branchBase')(function* (defaultBranch: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, defaultBranch})
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

		const commits = Effect.fn('GitReview.commits')(function* (base: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* pipe(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s', `${from}..HEAD`]),
				Effect.map(Array.map(commitFromLogLine))
			)
		})

		const firstParentCommits = pipe(
			git.lines(config.cwd, ['log', '--first-parent', '--max-count=80', '--format=%H%x00%h%x00%s', 'HEAD']),
			Effect.map(Array.map(commitFromLogLine))
		)

		const pushableCommitCount = Effect.fn('GitReview.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const branch = yield* currentBranch
			const remoteBranch = `origin/${branch}`
			const hasRemoteBranch = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--verify', remoteBranch]),
				Effect.as(true),
				Effect.orElseSucceed(() => false)
			)

			if (hasRemoteBranch) {
				return yield* pipe(
					git.string(config.cwd, ['rev-list', '--count', `${remoteBranch}..HEAD`]),
					Effect.map(
						flow(
							String.trim,
							Number.parse,
							Option.getOrElse(() => 0)
						)
					)
				)
			}

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* pipe(
				git.string(config.cwd, ['rev-list', '--count', `${from}..HEAD`]),
				Effect.map(
					flow(
						String.trim,
						Number.parse,
						Option.getOrElse(() => 0)
					)
				)
			)
		})

		const hasPushableCommits = pipe(
			pushableCommitCount(),
			Effect.map(count => count > 0)
		)

		const prReviewThreads = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const pr = yield* pipe(
				ghString(['pr', 'view', '--json', 'number', '--jq', '.number']),
				Effect.map(flow(String.trim, Number.parse)),
				Effect.flatMap(Option.match({onNone: () => new GitError({message: 'No PR found.'}), onSome: Effect.succeed}))
			)
			const repository = yield* pipe(
				ghString(['repo', 'view', '--json', 'owner,name']),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubRepositoryResponse))),
				Effect.mapError(cause => new GitError({cause, message: 'Failed to parse GitHub repository.'}))
			)
			const query = `
				query($owner: String!, $name: String!, $number: Int!) {
					repository(owner: $owner, name: $name) {
						pullRequest(number: $number) {
							reviewThreads(first: 100) {
								nodes {
									id
									isResolved
									diffSide
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
			const data = yield* pipe(
				Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubReviewThreadsResponse))(response),
				Effect.mapError(cause => new GitError({cause, message: 'Failed to parse GitHub review threads.'}))
			)
			const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
			yield* Effect.annotateCurrentSpan({threadCount: Array.length(threads)})

			return pipe(
				threads,
				Array.flatMap(thread =>
					pipe(
						thread.comments.nodes,
						Array.map(
							comment =>
								new GitHubReviewThread({
									body: comment.body,
									filePath: comment.path,
									id: thread.id,
									lineNumber: comment.line ?? comment.originalLine ?? 1,
									resolved: thread.isResolved,
									side: thread.diffSide === 'LEFT' ? 'deletions' : 'additions',
									url: comment.url
								})
						)
					)
				)
			)
		}).pipe(Effect.withSpan('GitReview.reviewThreads', {attributes: {cwd: config.cwd}}))

		const worktreeChanges = pipe(
			Stream.make(void 0),
			Stream.merge(
				pipe(
					fs.watch(config.cwd),
					Stream.catch(() => Stream.empty),
					Stream.map(() => void 0)
				)
			),
			Stream.debounce(Duration.millis(50))
		)

		return {
			commits,
			metadata: Effect.fn('GitReview.metadata')(function* () {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd})
				const branch = yield* currentBranch
				const defaultBranch = yield* defaultBranchName
				const base = yield* branchBase(defaultBranch)
				const displayCommits = branch === defaultBranch ? yield* firstParentCommits : yield* commits(base)

				return new GitReviewMetadata({
					commits: displayCommits,
					dirty: yield* hasWorktreeChanges,
					prUrl: Option.getOrUndefined(yield* branchPrUrl),
					unpushedCommits: yield* hasPushableCommits
				})
			}),
			resolveReviewThread: Effect.fn('GitReview.resolveReviewThread')(function* (threadId: string) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, threadId})
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
			reviewDiffs,
			reviewThreads: pipe(
				prReviewThreads,
				Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitHubReviewThread>()))
			),
			watchReviewDiffs: (target: GitReviewTarget, filePath?: string) => {
				const diffs = pipe(
					reviewDiffs(target, filePath),
					Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitDiff>()))
				)
				if (target._tag === 'commit') return Stream.fromEffect(diffs)

				return Stream.fromEffect(diffs).pipe(
					Stream.concat(
						pipe(
							worktreeChanges,
							Stream.mapEffect(() => diffs)
						)
					),
					Stream.changesWith(
						(left, right) =>
							Array.length(left) === Array.length(right) &&
							Array.every(
								left,
								(leftDiff, index) =>
									Predicate.isNotUndefined(right[index]) &&
									leftDiff.filePath === right[index].filePath &&
									leftDiff.status === right[index].status &&
									leftDiff.patch === right[index].patch
							)
					)
				)
			}
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}

export class GitCommitAction extends Context.Service<GitCommitAction>()('@deslop/git/service/GitCommitAction', {
	make: Effect.fn('GitCommitAction.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand

		const ghString = Effect.fn('gh.string')(function* (args: readonly string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd: config.cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('gh', args, {cwd: config.cwd, stderr: 'pipe', stdout: 'pipe'})),
						Effect.mapError(cause => new GitError({cause}))
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* pipe(
						handle.exitCode,
						Effect.mapError(cause => new GitError({cause}))
					)

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `gh ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return output.stdout
				})
			).pipe(Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd: config.cwd}}))
		})

		const hasWorktreeChanges = pipe(
			git.lines(config.cwd, ['status', '--porcelain']),
			Effect.map(lines => !Array.isReadonlyArrayEmpty(lines))
		)
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
		const branchBase = Effect.fn('GitCommitAction.branchBase')(function* (defaultBranch: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, defaultBranch})
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
		const pushableCommitCount = Effect.fn('GitCommitAction.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const branch = yield* currentBranch
			const remoteBranch = `origin/${branch}`
			const hasRemoteBranch = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--verify', remoteBranch]),
				Effect.as(true),
				Effect.orElseSucceed(() => false)
			)

			if (hasRemoteBranch) {
				return yield* pipe(
					git.string(config.cwd, ['rev-list', '--count', `${remoteBranch}..HEAD`]),
					Effect.map(
						flow(
							String.trim,
							Number.parse,
							Option.getOrElse(() => 0)
						)
					)
				)
			}

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* pipe(
				git.string(config.cwd, ['rev-list', '--count', `${from}..HEAD`]),
				Effect.map(
					flow(
						String.trim,
						Number.parse,
						Option.getOrElse(() => 0)
					)
				)
			)
		})
		const hasPushableCommits = pipe(
			pushableCommitCount(),
			Effect.map(count => count > 0)
		)
		const createDraftPr = pipe(
			ghString(['pr', 'create', '--draft', '--fill']),
			Effect.map(output => {
				const url = output.match(/https?:\/\/\S+/u)?.[0] ?? String.trim(output)
				return String.isNonEmpty(url) ? Option.some(url) : Option.none<string>()
			})
		)

		return {
			commitAndPush: Effect.fn('GitCommitAction.commitAndPush')(function* (message: string) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd})
				const dirty = yield* hasWorktreeChanges
				yield* Effect.annotateCurrentSpan({dirty})

				if (dirty) {
					if (String.isEmpty(String.trim(message))) {
						return yield* new GitError({message: 'Commit message required.'})
					}
					yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid, Effect.withSpan('GitCommitAction.stageAll'))
					yield* pipe(
						git.string(config.cwd, ['commit', '-m', message]),
						Effect.asVoid,
						Effect.withSpan('GitCommitAction.create')
					)
				} else if (!(yield* hasPushableCommits)) {
					return yield* new GitError({message: 'No changes or unpushed commits.'})
				}

				const branch = yield* currentBranch
				yield* Effect.annotateCurrentSpan({branch})
				yield* pipe(
					git.string(config.cwd, ['push', '-u', 'origin', `HEAD:${branch}`]),
					Effect.asVoid,
					Effect.withSpan('GitCommitAction.push', {attributes: {branch, cwd: config.cwd}})
				)
				if (yield* hasPushableCommits) {
					return yield* new GitError({message: 'Push completed but the branch still has unpushed commits.'})
				}

				const defaultBranch = yield* defaultBranchName
				if (branch !== defaultBranch && Option.isNone(yield* branchPrUrl)) {
					yield* pipe(
						createDraftPr,
						Effect.withSpan('GitCommitAction.createDraftPr', {attributes: {branch, cwd: config.cwd}})
					)
				}
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
