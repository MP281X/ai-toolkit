import * as NodeFs from 'node:fs'

import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	FileSystem,
	Layer,
	Match,
	Number,
	Option,
	Order,
	Path,
	Predicate,
	Random,
	Result,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {
	GitBranch,
	GitBranchesSnapshot,
	GitCommit,
	GitDiff,
	GitError,
	GitHubRepositoryResponse,
	GitHubReviewThreadsResponse,
	GitHubReviewThread,
	GitProject,
	GitReviewFile,
	GitReviewMetadata,
	GitReviewOverview,
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

function diffFromPatchChunk(chunk: string) {
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

	return new GitDiff({content: '', filePath, patch: chunk, status})
}

function isWipSubject(subject: string) {
	return subject === 'wip' || String.startsWith('wip: ')(subject)
}

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

		const getWorktreeStatus = Effect.fnUntraced(function* (cwd: string) {
			const status = yield* pipe(
				git.string(cwd, ['status', '--porcelain=v2', '--branch', '-z']),
				Effect.orElseSucceed(() => '')
			)
			const entries = pipe(String.split('\u0000')(status), Array.filter(String.isNonEmpty))
			const branchLine = pipe(
				entries,
				Array.findFirst(entry => String.startsWith('# branch.ab ')(entry)),
				Option.getOrElse(() => '# branch.ab +0 -0')
			)
			const counts = String.split(/\s+/u)(branchLine)
			const ahead = Option.getOrElse(Number.parse(String.replace(/^\+/u, '')(counts[2] ?? '0')), () => 0)
			const behind = Option.getOrElse(Number.parse(String.replace(/^-/u, '')(counts[3] ?? '0')), () => 0)

			return new GitWorktreeStatus({
				ahead,
				behind,
				dirtyTracked: Array.some(entries, entry => String.startsWith('1 ')(entry) || String.startsWith('2 ')(entry)),
				unpushedCommits: ahead > 0,
				untracked: Array.some(entries, String.startsWith('? '))
			})
		})

		const collectRepositoriesFromRoots: (
			roots: readonly string[],
			repositories: readonly Result.Result<GitRepository, void>[]
		) => Effect.Effect<readonly Result.Result<GitRepository, void>[], GitError> = Effect.fnUntraced(
			function* (roots, repositories) {
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
										git.string(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
										Effect.map(String.trim),
										Effect.map(gitDirectory => Result.succeed(new GitRepository({gitDirectory, root}))),
										Effect.orElseSucceed(() => Result.failVoid),
										Effect.flatMap(repository =>
											collectRepositoriesFromRoots(
												Array.drop(remainingRoots, 1),
												Array.append(repositories, repository)
											)
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
				Array.map(
					worktree =>
						new GitWorktreeSchema({
							branch: String.isNonEmpty(worktree.branch) ? worktree.branch : undefined,
							root: worktree.root
						})
				),
				Effect.succeed
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
			const structuralProjects = yield* listProjectsFrom(home)
			yield* SubscriptionRef.set(projects, structuralProjects)
			run(
				pipe(
					structuralProjects,
					Effect.forEach(
						project =>
							pipe(
								project.worktrees,
								Effect.forEach(
									worktree =>
										pipe(
											getWorktreeStatus(worktree.root),
											Effect.map(status => new GitWorktreeSchema({...worktree, status}))
										),
									{concurrency: 'unbounded'}
								),
								Effect.map(worktrees => new GitProject({...project, worktrees}))
							),
						{concurrency: 'unbounded'}
					),
					Effect.flatMap(projectsWithStatus => SubscriptionRef.set(projects, projectsWithStatus))
				)
			)
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

				if (Predicate.isNotUndefined(worktree.branch)) {
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

		function diffsFromPatch(patch: string) {
			return pipe(patch.split(/(?=^diff --git )/mu), Array.filter(String.isNonEmpty), Array.map(diffFromPatchChunk))
		}

		const diffContent = Effect.fnUntraced(function* (diff: GitDiff) {
			const content =
				diff.status === 'deleted'
					? ''
					: yield* pipe(
							fs.readFileString(path.join(config.cwd, diff.filePath)),
							Effect.orElseSucceed(() => '')
						)

			return new GitDiff({content, filePath: diff.filePath, patch: diff.patch, status: diff.status})
		})

		const trackedDiffs = Effect.fnUntraced(function* (input: {readonly from: string}) {
			const patch = yield* git.string(config.cwd, [
				'diff',
				input.from,
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--patch',
				'--find-renames',
				'--no-ext-diff'
			])

			return yield* pipe(diffsFromPatch(patch), Effect.forEach(diffContent, {concurrency: 'unbounded'}))
		})

		const untrackedFileDiff = Effect.fnUntraced(function* (filePath: string) {
			const content = yield* pipe(
				fs.readFileString(path.join(config.cwd, filePath)),
				Effect.orElseSucceed(() => '')
			)

			const lines = String.split('\n')(content)

			return new GitDiff({
				content,
				filePath,
				patch: `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(lines)} @@\n${pipe(
					lines,
					Array.map(line => `+${line}`),
					Array.join('\n')
				)}`,
				status: 'added'
			})
		})

		const untrackedDiffs = pipe(
			git.string(config.cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
			Effect.flatMap(output =>
				pipe(
					String.split('\u0000')(output),
					Array.filter(String.isNonEmpty),
					Effect.forEach(untrackedFileDiff, {concurrency: 'unbounded'})
				)
			)
		)

		const reviewRangeOverview = Effect.fnUntraced(function* (input: {readonly from: string}) {
			const diffs = yield* pipe(
				Effect.all([trackedDiffs(input), untrackedDiffs], {concurrency: 'unbounded'}),
				Effect.map(([tracked, untracked]) => Array.appendAll(tracked, untracked))
			)
			const files = pipe(
				diffs,
				Array.map(diff => new GitReviewFile({filePath: diff.filePath, status: diff.status})),
				Array.dedupeWith((left, right) => left.filePath === right.filePath)
			)

			return new GitReviewOverview({diffs, files})
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
			Effect.map(flow(String.trim, String.replace(/^origin\//u, '')))
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

		function commitFromLogLine(line: string) {
			const parts = String.split('\u0000')(line)
			const subject = parts[2] ?? ''

			return new GitCommit({
				hash: parts[0],
				parents: pipe(parts[3] ?? '', String.split(' '), Array.filter(String.isNonEmpty)),
				shortHash: parts[1] ?? '',
				subject,
				wip: isWipSubject(subject)
			})
		}

		const commits = Effect.fnUntraced(function* (base: string) {
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)

			return yield* pipe(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s%x00%P', `${from}..HEAD`]),
				Effect.map(Array.map(commitFromLogLine))
			)
		})

		const firstParentCommits = pipe(
			git.lines(config.cwd, ['log', '--first-parent', '--max-count=80', '--format=%H%x00%h%x00%s%x00%P', 'HEAD']),
			Effect.map(Array.map(commitFromLogLine))
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
		})

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
				const subject = pipe(message, String.trim, value => (String.isEmpty(value) ? 'wip' : `wip: ${value}`))
				yield* pipe(git.string(config.cwd, ['commit', '-m', subject]), Effect.asVoid)
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
			reviewThreads: pipe(
				prReviewThreads,
				Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitHubReviewThread>()))
			),
			watchReviewRangeOverview: (input: {readonly from: string}) =>
				pipe(
					worktreeChanges,
					Stream.mapEffect(() =>
						pipe(
							reviewRangeOverview(input),
							Effect.catchTag('GitError', () =>
								Effect.succeed(new GitReviewOverview({diffs: Array.empty(), files: Array.empty()}))
							)
						)
					),
					Stream.changesWith(
						(left, right) =>
							Array.length(left.files) === Array.length(right.files) &&
							Array.every(
								left.files,
								(leftFile, index) =>
									Predicate.isNotUndefined(right.files[index]) &&
									leftFile.filePath === right.files[index].filePath &&
									leftFile.status === right.files[index].status
							) &&
							Array.length(left.diffs) === Array.length(right.diffs) &&
							Array.every(
								left.diffs,
								(leftDiff, index) =>
									Predicate.isNotUndefined(right.diffs[index]) &&
									leftDiff.filePath === right.diffs[index].filePath &&
									leftDiff.status === right.diffs[index].status &&
									leftDiff.content === right.diffs[index].content &&
									leftDiff.patch === right.diffs[index].patch
							)
					)
				)
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
