import {createHash} from 'node:crypto'
import * as NodeFs from 'node:fs'
import {homedir} from 'node:os'

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
	Ref,
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
	GitDiffSegment,
	GitError,
	GitProject,
	GitPullRequest,
	GitReviewComment,
	GitReviewMetadata,
	GitReviewState,
	GitRepository,
	type GitReviewMark,
	type GitReviewTarget,
	type GitWorktreeSource,
	GitWorktree as GitWorktreeSchema,
	gitReviewStateMark,
	gitReviewStateResolveComment,
	gitReviewStateSaveComment,
	gitReviewStateUnmark
} from './schema.ts'

class GitCommand extends Context.Service<GitCommand>()('@deslop/git/service/GitCommand', {
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

		const stringWithInput = Effect.fn('GitCommand.stringWithInput')(function* (
			cwd: string,
			args: readonly string[],
			input: string
		) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'git', cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(
							ChildProcess.make('git', args, {
								cwd,
								stderr: 'pipe',
								stdin: Stream.make(Buffer.from(input, 'utf8')),
								stdout: 'pipe'
							})
						),
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
			string,
			stringWithInput
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}

const excludedDiscoveryEntries = new Set(['.git', 'build', 'dist', 'node_modules', 'target'])
const excludedHomeDiscoveryEntries = new Set(['Applications', 'Library', 'Movies', 'Music', 'Pictures', 'Public'])
const repositoryProbeGlobs = [
	'!**/.*/**',
	'**/.git/HEAD',
	'!**/node_modules/**',
	'!**/dist/**',
	'!**/build/**',
	'!**/target/**'
]
const repositoryProbePermissionError =
	/: (?:Permission denied|Operation not permitted|Access is denied\.?) \(os error (?:1|5|13)\)$/u

const reviewExclusionPathspecs = [
	':(exclude)pnpm-lock.yaml',
	':(exclude)*.gen.ts',
	':(exclude)**/*.gen.ts',
	':(exclude)components/ui/**',
	':(exclude)**/components/ui/**',
	':(exclude)components/svgs/**',
	':(exclude)**/components/svgs/**',
	':(exclude)plans/*.md',
	':(exclude)**/plans/*.md'
]

function isReviewExcludedPath(filePath: string) {
	const parts = String.split('/')(filePath)
	const basename = parts.at(-1) ?? filePath

	if (filePath === 'pnpm-lock.yaml') return true
	if (String.endsWith('.gen.ts')(basename)) return true
	for (let index = 0; index < parts.length - 1; index += 1) {
		const current = parts[index]
		const next = parts[index + 1]
		if (current === 'components' && (next === 'ui' || next === 'svgs')) return true
		if (current === 'plans' && index === parts.length - 2 && String.endsWith('.md')(basename)) return true
	}
	return false
}

const GitHubPullRequestViewResponse = Schema.Struct({url: Schema.optional(Schema.String)})

const GitHubRepositoryResponse = Schema.Struct({name: Schema.String, owner: Schema.Struct({login: Schema.String})})

const GitHubReviewThreadCommentResponse = Schema.Struct({
	body: Schema.String,
	line: Schema.optional(Schema.NullOr(Schema.Number)),
	originalLine: Schema.optional(Schema.NullOr(Schema.Number)),
	path: Schema.String,
	url: Schema.optional(Schema.String)
})

const GitHubReviewThreadResponse = Schema.Struct({
	comments: Schema.Struct({nodes: Schema.Array(GitHubReviewThreadCommentResponse)}),
	diffSide: Schema.optional(Schema.String),
	id: Schema.String,
	isResolved: Schema.Boolean
})

const GitHubPullRequestResponse = Schema.Struct({
	reviewThreads: Schema.optional(Schema.Struct({nodes: Schema.Array(GitHubReviewThreadResponse)}))
})

const GitHubReviewRepositoryResponse = Schema.Struct({pullRequest: Schema.optional(GitHubPullRequestResponse)})

const GitHubReviewThreadsResponse = Schema.Struct({
	data: Schema.optional(Schema.Struct({repository: Schema.optional(GitHubReviewRepositoryResponse)}))
})

function normalizePublicPath(value: string) {
	return String.startsWith('/private/var/')(value) ? String.replace(/^\/private/u, '')(value) : value
}

function pathSlug(value: string) {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
	return slug === '' ? 'worktree' : slug
}

function repositorySlug(root: string) {
	const realRoot = NodeFs.realpathSync.native(root)
	const hash = createHash('sha256').update(realRoot).digest('hex').slice(0, 10)
	return `${pathSlug(realRoot.split('/').at(-1) ?? realRoot)}-${hash}`
}

function branchSlug(branch: string) {
	return pathSlug(branch)
}

function validWorkbenchBranch(branch: string) {
	return /^(feat|fix|refactor|perf|test|docs|chore)\/[a-z0-9-]+$/u.test(branch)
}

function sameProjectSnapshot(left: readonly GitProject[], right: readonly GitProject[]) {
	if (Array.length(left) !== Array.length(right)) return false
	return Array.every(left, (leftProject, projectIndex) => {
		const rightProject = right[projectIndex]
		if (rightProject === undefined) return false
		if (
			leftProject.repository.gitDirectory !== rightProject.repository.gitDirectory ||
			leftProject.repository.root !== rightProject.repository.root ||
			Array.length(leftProject.worktrees) !== Array.length(rightProject.worktrees)
		) {
			return false
		}

		return Array.every(leftProject.worktrees, (leftWorktree, worktreeIndex) => {
			const rightWorktree = rightProject.worktrees[worktreeIndex]
			if (rightWorktree === undefined) return false
			return leftWorktree.branch === rightWorktree.branch && leftWorktree.root === rightWorktree.root
		})
	})
}

function repositoryProbeOnlyPermissionErrors(stderr: string) {
	const lines = pipe(stderr, String.split(/\r?\n/u), Array.filter(String.isNonEmpty))
	return !Array.isReadonlyArrayEmpty(lines) && Array.every(lines, line => repositoryProbePermissionError.test(line))
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

function withDisplayedPatchSegments(diffs: readonly GitDiff[], id: string, type: 'commit' | 'worktree') {
	return Array.map(
		diffs,
		diff =>
			new GitDiff({
				fileContent: diff.fileContent,
				filePath: diff.filePath,
				patch: diff.patch,
				segments: [new GitDiffSegment({filePath: diff.filePath, fingerprint: diff.patch, id, type})],
				status: diff.status
			})
	)
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

type GitWorkspaceCreateWorktreeInput = {
	readonly branch: string
	readonly cwd: string
	readonly source: GitWorktreeSource
}

type GitWorkspaceMock = {
	readonly branches?: (cwd: string) => Effect.Effect<GitBranchesSnapshot, GitError>
	readonly createWorktree?: (input: GitWorkspaceCreateWorktreeInput) => Effect.Effect<string, GitError>
	readonly deleteWorktree?: (input: {readonly cwd: string}) => Effect.Effect<void, GitError>
	readonly fix?: (cwd: string) => Effect.Effect<void, GitError>
	readonly listProjectsFrom?: (cwd: string) => Effect.Effect<GitProject[], GitError>
	readonly listRepositoriesFrom?: (cwd: string) => Effect.Effect<GitRepository[], GitError>
	readonly listWorktrees?: (cwd: string) => Effect.Effect<GitWorktreeSchema[], GitError>
	readonly projects?: readonly GitProject[]
	readonly refreshProjects?: () => Effect.Effect<void, GitError>
}

function matchingGitWorkspaceProject(cwd: string, snapshot: readonly GitProject[]) {
	return pipe(
		snapshot,
		Array.findFirst(
			project =>
				project.repository.root === cwd ||
				project.repository.gitDirectory === cwd ||
				Array.some(project.worktrees, worktree => worktree.root === cwd)
		)
	)
}

type GitReviewMock = {
	readonly commits?: (base: string) => Effect.Effect<GitCommit[], GitError>
	readonly initialState?: GitReviewState
	readonly metadata?: () => Effect.Effect<GitReviewMetadata, GitError>
	readonly reviewComments?: Effect.Effect<GitReviewComment[]>
	readonly resolveReviewThread?: (threadId: string) => Effect.Effect<void, GitError>
	readonly reviewDiffs?: (target: GitReviewTarget) => Effect.Effect<GitDiff[], GitError>
	readonly watchReviewDiffs?: (target: GitReviewTarget) => Stream.Stream<GitDiff[]>
	readonly watchReviewMetadata?: () => Stream.Stream<GitReviewMetadata>
	readonly watchReviewState?: () => Stream.Stream<GitReviewState>
}

type GitPublishMock = {
	readonly approve?: (input: {readonly message: string}) => Effect.Effect<GitPullRequest | undefined, GitError>
	readonly current?: GitPullRequest
}

export class GitWorkspace extends Context.Service<GitWorkspace>()('@deslop/git/service/GitWorkspace', {
	make: Effect.gen(function* () {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(homedir()))
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())

		const worktreeClean = Effect.fn('GitWorkspace.worktreeClean')(function* (cwd: string) {
			return yield* pipe(git.lines(cwd, ['status', '--porcelain']), Effect.map(Array.isReadonlyArrayEmpty))
		})

		const fixProject = Effect.fn('GitWorkspace.fixProject')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})

			const root = yield* Effect.sync(() => NodeFs.realpathSync.native(cwd))
			yield* pipe(git.string(cwd, ['worktree', 'prune']), Effect.asVoid)
			yield* pipe(git.string(cwd, ['fetch', '--all', '--prune']), Effect.asVoid)
			const defaultBranch = yield* pipe(
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
			const mergedBranches = new Set(
				yield* git.lines(cwd, ['branch', '--merged', `origin/${defaultBranch}`, '--format=%(refname:short)'])
			)
			const branchLines = yield* git.lines(cwd, [
				'for-each-ref',
				'refs/heads',
				'--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(worktreepath)'
			])

			function fixBranch(branchLine: string) {
				return Effect.gen(function* () {
					const fields = String.split('\u0000')(branchLine)
					const branch = fields[0]
					const upstream = fields[1] ?? ''
					const track = fields[2] ?? ''
					const worktreePath = fields[3] ?? ''
					const worktreeRoot = String.isNonEmpty(worktreePath)
						? yield* Effect.sync(() =>
								NodeFs.existsSync(worktreePath) ? NodeFs.realpathSync.native(worktreePath) : worktreePath
							)
						: ''

					if (String.isEmpty(branch)) return
					if (track === '[gone]') {
						if (worktreeRoot === root) return
						if (String.isNonEmpty(worktreePath)) {
							yield* git.string(cwd, ['worktree', 'remove', '--force', worktreePath])
						}
						yield* git.string(cwd, ['branch', '-D', branch])
						return
					}
					if (String.isEmpty(upstream)) {
						if (branch === defaultBranch) return
						if (!mergedBranches.has(branch)) return
						if (worktreeRoot === root) return
						if (String.isNonEmpty(worktreePath)) {
							yield* git.string(cwd, ['worktree', 'remove', '--force', worktreePath])
						}

						yield* git.string(cwd, ['branch', '-D', branch])
						return
					}

					if (String.includes('behind')(track) && !String.includes('ahead')(track)) {
						const targetCwd = String.isNonEmpty(worktreePath) ? worktreePath : cwd
						if (!(yield* worktreeClean(targetCwd))) return
						if (String.isNonEmpty(worktreePath)) {
							yield* pipe(git.string(worktreePath, ['merge', '--ff-only', upstream]), Effect.asVoid)
							return
						}

						yield* pipe(git.string(cwd, ['branch', '-f', branch, upstream]), Effect.asVoid)
						return
					}
					if (!String.includes('ahead')(track) || !String.includes('behind')(track)) return
					const targetCwd = String.isNonEmpty(worktreePath) ? worktreePath : cwd
					if (!(yield* worktreeClean(targetCwd))) return

					yield* pipe(
						git.string(targetCwd, ['rebase', upstream]),
						Effect.catchTag('GitError', error =>
							pipe(git.string(targetCwd, ['rebase', '--abort']), Effect.ignore, Effect.andThen(Effect.fail(error)))
						),
						Effect.asVoid
					)
				})
			}

			yield* Effect.forEach(branchLines, fixBranch, {discard: true})
		})

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

		const repositoryProbeOutput = Effect.fnUntraced(function* (searchRoots: readonly string[]) {
			const args = ['--hidden', '--files', ...Array.flatMap(repositoryProbeGlobs, glob => ['-g', glob]), ...searchRoots]
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('rg', args, {stderr: 'pipe', stdout: 'pipe'})),
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

					if (
						exitCode === ChildProcessSpawner.ExitCode(0) ||
						exitCode === ChildProcessSpawner.ExitCode(1) ||
						(exitCode === ChildProcessSpawner.ExitCode(2) && repositoryProbeOnlyPermissionErrors(output.stderr))
					) {
						return output.stdout
					}

					return yield* new GitError({
						cause: new Error(output.stderr || output.stdout || `rg ${Array.join(' ')(args)} exited with ${exitCode}`)
					})
				})
			)
		})
		const directRepositoryRoot = Effect.fnUntraced(function* (root: string) {
			return NodeFs.existsSync(path.join(root, '.git', 'HEAD'))
				? Option.some(normalizePublicPath(root))
				: Option.none<string>()
		})
		const repositorySearchRoots = Effect.fn('GitWorkspace.repositorySearchRoots')(function* (root: string) {
			if (root !== home) return [root]

			const entries = yield* pipe(
				fs.readDirectory(root),
				Effect.orElseSucceed(() => Array.empty<string>())
			)
			return yield* pipe(
				entries,
				Array.filter(entry => !excludedHomeDiscoveryEntries.has(entry)),
				Array.filter(entry => !excludedDiscoveryEntries.has(entry)),
				Array.filter(entry => !String.startsWith('.')(entry)),
				Effect.forEach(entry =>
					Effect.gen(function* () {
						const directory = path.join(root, entry)
						const info = yield* pipe(
							fs.stat(directory),
							Effect.orElseSucceed(() => {})
						)
						return info?.type === 'Directory' ? directory : ''
					})
				),
				Effect.map(Array.filter(String.isNonEmpty))
			)
		})
		const repositoryRootsFromProbe = Effect.fn('GitWorkspace.repositoryRootsFromProbe')(function* (root: string) {
			const directRoot = yield* directRepositoryRoot(root)
			if (Option.isSome(directRoot)) return [directRoot.value]

			const searchRoots = yield* repositorySearchRoots(root)
			if (Array.isReadonlyArrayEmpty(searchRoots)) return Array.getSomes([directRoot])

			const output = yield* repositoryProbeOutput(searchRoots)

			return pipe(
				output,
				String.split(/\r?\n/u),
				Array.filter(String.isNonEmpty),
				Array.map(head => normalizePublicPath(path.dirname(path.dirname(head)))),
				Array.dedupe,
				Array.sortWith(repositoryRoot => repositoryRoot, Order.String)
			)
		})
		const repositoryFromRoot = Effect.fn('GitWorkspace.repositoryFromRoot')(function* (root: string) {
			return yield* pipe(
				Effect.all(
					{
						gitDirectory: pipe(
							git.string(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
							Effect.map(flow(String.trim, normalizePublicPath))
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
							root: normalizePublicPath(repository.worktrees[0]?.root ?? root)
						})
				)
			)
		})
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

			return pipe(
				worktrees,
				Array.map(
					worktree => new GitWorktreeSchema({branch: worktree.branch, root: normalizePublicPath(worktree.root)})
				)
			)
		})

		const listRepositoriesFrom = Effect.fn('GitWorkspace.listRepositoriesFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				repositoryRootsFromProbe(cwd),
				Effect.flatMap(Effect.forEach(root => Effect.option(repositoryFromRoot(root)), {concurrency: 32})),
				Effect.map(repositories =>
					pipe(
						repositories,
						Array.getSomes,
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
			const next = yield* listProjectsFrom(home)
			const current = yield* SubscriptionRef.get(projects)
			if (!sameProjectSnapshot(current, next)) yield* SubscriptionRef.set(projects, next)
		})
		yield* refreshProjects()

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
				readonly source: GitWorktreeSource
			}) {
				yield* Effect.annotateCurrentSpan({branch: input.branch, cwd: input.cwd})
				if (input.source._tag === 'new' && !validWorkbenchBranch(input.branch)) {
					return yield* new GitError({
						message:
							'New worktree branches must start with feat/, fix/, refactor/, perf/, test/, docs/, or chore/ and use lowercase letters, digits, and hyphens after the prefix.'
					})
				}
				const targetDirectory = path.join(
					home,
					'.deslop',
					'worktrees',
					repositorySlug(input.cwd),
					branchSlug(input.branch)
				)
				const createdWorktreeRoot = pipe(
					git.string(input.cwd, ['worktree', 'list', '--porcelain', '-z']),
					Effect.map(parseWorktreeRecords),
					Effect.map(worktrees =>
						pipe(
							worktrees,
							Array.findFirst(worktree => worktree.branch === input.branch),
							Option.map(worktree => normalizePublicPath(worktree.root)),
							Option.getOrElse(() => targetDirectory)
						)
					)
				)

				yield* pipe(fs.makeDirectory(path.dirname(targetDirectory), {recursive: true}), Effect.ignore)

				yield* Match.value(input.source).pipe(
					Match.when({_tag: 'local'}, () =>
						pipe(
							Effect.annotateCurrentSpan({source: 'local'}),
							Effect.andThen(git.string(input.cwd, ['worktree', 'add', targetDirectory, input.branch])),
							Effect.asVoid
						)
					),
					Match.when({_tag: 'remote'}, source =>
						pipe(
							Effect.annotateCurrentSpan({remote: source.remote, source: 'remote'}),
							Effect.andThen(git.string(input.cwd, ['fetch', '--prune', source.remote])),
							Effect.andThen(
								git.string(input.cwd, [
									'worktree',
									'add',
									'-b',
									input.branch,
									targetDirectory,
									`${source.remote}/${input.branch}`
								])
							),
							Effect.asVoid
						)
					),
					Match.orElse(() =>
						Effect.gen(function* () {
							const defaultBranch = yield* getDefaultBranch(input.cwd)
							const base = yield* pipe(
								git.string(input.cwd, ['rev-parse', '--verify', `origin/${defaultBranch}`]),
								Effect.as(`origin/${defaultBranch}`),
								Effect.catchTag('GitError', () => Effect.succeed(defaultBranch))
							)

							yield* Effect.annotateCurrentSpan({source: 'new'})
							yield* pipe(
								git.string(input.cwd, ['worktree', 'add', '--no-track', '-b', input.branch, targetDirectory, base]),
								Effect.asVoid
							)
						})
					)
				)
				yield* refreshProjects()
				return yield* createdWorktreeRoot
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
			fix: Effect.fn('GitWorkspace.fix')(function* (cwd: string) {
				yield* fixProject(cwd)
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
	public static layer = pipe(Layer.effect(this, this.make), Layer.provide(GitCommand.layer))
	public static layerMock(input: GitWorkspaceMock = {}) {
		return Layer.effect(
			this,
			Effect.gen(function* () {
				const projects = yield* SubscriptionRef.make<GitProject[]>([...(input.projects ?? [])])

				return {
					branches: Effect.fn('GitWorkspace.mock.branches')(function* (cwd: string) {
						if (input.branches !== undefined) return yield* input.branches(cwd)
						return new GitBranchesSnapshot({
							branches: [new GitBranch({name: 'main', type: 'local'})],
							defaultBranch: 'main'
						})
					}),
					createWorktree: Effect.fn('GitWorkspace.mock.createWorktree')(function* (
						worktreeInput: GitWorkspaceCreateWorktreeInput
					) {
						if (input.createWorktree !== undefined) return yield* input.createWorktree(worktreeInput)
						const root = `${worktreeInput.cwd}/.deslop-mock/${branchSlug(worktreeInput.branch)}`
						yield* SubscriptionRef.update(projects, snapshot =>
							snapshot.map(project =>
								project.repository.root === worktreeInput.cwd ||
								Array.some(project.worktrees, worktree => worktree.root === worktreeInput.cwd)
									? new GitProject({
											repository: project.repository,
											worktrees: [...project.worktrees, new GitWorktreeSchema({branch: worktreeInput.branch, root})]
										})
									: project
							)
						)
						return root
					}),
					deleteWorktree: Effect.fn('GitWorkspace.mock.deleteWorktree')(function* (deleteInput: {
						readonly cwd: string
					}) {
						if (input.deleteWorktree !== undefined) return yield* input.deleteWorktree(deleteInput)
						yield* SubscriptionRef.update(projects, snapshot =>
							snapshot.map(
								project =>
									new GitProject({
										repository: project.repository,
										worktrees: project.worktrees.filter(worktree => worktree.root !== deleteInput.cwd)
									})
							)
						)
					}),
					fix: Effect.fn('GitWorkspace.mock.fix')(function* (cwd: string) {
						if (input.fix !== undefined) yield* input.fix(cwd)
					}),
					listProjectsFrom: Effect.fn('GitWorkspace.mock.listProjectsFrom')(function* (cwd: string) {
						if (input.listProjectsFrom !== undefined) return yield* input.listProjectsFrom(cwd)
						return yield* SubscriptionRef.get(projects)
					}),
					listRepositoriesFrom: Effect.fn('GitWorkspace.mock.listRepositoriesFrom')(function* (cwd: string) {
						if (input.listRepositoriesFrom !== undefined) return yield* input.listRepositoriesFrom(cwd)
						return (yield* SubscriptionRef.get(projects)).map(project => project.repository)
					}),
					listWorktrees: Effect.fn('GitWorkspace.mock.listWorktrees')(function* (cwd: string) {
						if (input.listWorktrees !== undefined) return yield* input.listWorktrees(cwd)
						return pipe(
							matchingGitWorkspaceProject(cwd, yield* SubscriptionRef.get(projects)),
							Option.map(project => [...project.worktrees]),
							Option.getOrElse((): GitWorktreeSchema[] => [])
						)
					}),
					projects,
					refreshProjects: Effect.fn('GitWorkspace.mock.refreshProjects')(function* () {
						if (input.refreshProjects !== undefined) yield* input.refreshProjects()
					})
				}
			})
		)
	}
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const state = yield* SubscriptionRef.make(new GitReviewState({comments: [], marks: []}))
		const githubCommentsRef = yield* Ref.make<Option.Option<readonly GitReviewComment[]>>(Option.none())

		const hasWorktreeChanges = pipe(
			git.lines(config.cwd, ['status', '--porcelain']),
			Effect.map(lines => !Array.isReadonlyArrayEmpty(lines))
		)

		function diffsFromPatch(patch: string, segments: readonly GitDiffSegment[]) {
			const groupedSegments = segmentsByFile(segments)

			return pipe(
				patch.split(/(?=^diff --git )/mu),
				Array.filter(chunk => /^diff --git /u.test(chunk)),
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
				'--no-ext-diff',
				'--',
				'.',
				...reviewExclusionPathspecs
			])

			const diffs = pipe(
				diffsFromPatch(patch, input.segments),
				Array.filter(diff => !isReviewExcludedPath(diff.filePath))
			)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffs)})
			return diffs
		})

		const commitDiffs = Effect.fn('GitReview.commitDiffs')(function* (hash: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const args = [
				'--root',
				'--patch',
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--find-renames',
				'--no-ext-diff'
			]
			const pathspec = ['--', '.', ...reviewExclusionPathspecs]
			const patch = yield* pipe(
				git.string(config.cwd, ['diff-tree', ...args, hash, ...pathspec]),
				Effect.flatMap(output => {
					if (/^diff --git /mu.test(output)) return Effect.succeed(output)

					return pipe(
						git.string(config.cwd, ['rev-list', '--parents', '-n', '1', hash]),
						Effect.map(flow(String.trim, String.split(/\s+/u))),
						Effect.flatMap(parents => {
							const parent = parents[1]
							if (parent === undefined) return Effect.succeed(output)

							return git.string(config.cwd, ['diff-tree', ...args, parent, hash, ...pathspec])
						})
					)
				})
			)
			const diffs = pipe(
				diffsFromPatch(patch, Array.empty()),
				Array.filter(diff => !isReviewExcludedPath(diff.filePath))
			)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffs)})
			return diffs
		})

		const untrackedDiffs = pipe(
			git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard']),
			Effect.map(Array.filter(filePath => !isReviewExcludedPath(filePath))),
			Effect.flatMap(files =>
				Effect.forEach(
					files,
					filePath =>
						pipe(
							fs.readFileString(path.join(config.cwd, filePath)),
							Effect.orElseSucceed(() => ''),
							Effect.map(content => {
								const patch = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${pipe(
									String.split('\n')(content),
									Array.map(line => `+${line}`),
									Array.join('\n')
								)}`

								return new GitDiff({
									filePath,
									patch,
									segments: [
										new GitDiffSegment({filePath, fingerprint: patch, id: 'HEAD->worktree', type: 'worktree'})
									],
									status: 'added'
								})
							})
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
			if (input.target._tag !== 'commit') {
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
			readonly target: GitReviewTarget
		}) {
			const contents = yield* Effect.forEach(
				input.diffs,
				diff =>
					pipe(
						fileContent({filePath: diff.filePath, target: input.target}),
						Effect.map(content => [diff.filePath, content] as const)
					),
				{concurrency: 1}
			)
			const contentByFilePath = new Map(contents)

			return Array.map(input.diffs, diff =>
				contentByFilePath.has(diff.filePath)
					? new GitDiff({
							fileContent: contentByFilePath.get(diff.filePath),
							filePath: diff.filePath,
							patch: diff.patch,
							segments: diff.segments,
							status: diff.status
						})
					: diff
			)
		})

		const reviewDiffs = Effect.fn('GitReview.reviewDiffs')(function* (target: GitReviewTarget) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, target: target._tag})
			if (target._tag === 'changes') return yield* withFileContent({diffs: yield* worktreeDiffs, target})

			if (target._tag === 'commit') {
				const id = `${target.hash}^->${target.hash}`
				const diffs = yield* commitDiffs(target.hash)
				const diffsWithSegments = withDisplayedPatchSegments(diffs, id, 'commit')
				yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

				return yield* withFileContent({diffs: diffsWithSegments, target})
			}

			const base = target._tag === 'local' ? yield* localBase() : yield* branchDiffBase()
			const diffs = yield* aggregateDiffs(base)
			const diffsWithSegments = withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree')
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

			return yield* withFileContent({diffs: diffsWithSegments, target})
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

		const commitsBetween = Effect.fn('GitReview.commitsBetween')(function* (from: string, to: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			return yield* pipe(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s', `${from}..${to}`]),
				Effect.map(Array.map(commitFromLogLine))
			)
		})

		const firstParentCommits = pipe(
			git.lines(config.cwd, ['log', '--first-parent', '--max-count=80', '--format=%H%x00%h%x00%s', 'HEAD']),
			Effect.map(Array.map(commitFromLogLine))
		)

		const pushableCommitCount = Effect.fn('GitReview.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(flow(String.trim, Option.some)),
				Effect.orElseSucceed(() => Option.none<string>())
			)

			if (Option.isSome(upstream)) {
				return yield* pipe(
					git.string(config.cwd, ['rev-list', '--count', `${upstream.value}..HEAD`]),
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

		const upstreamCounts = Effect.fn('GitReview.upstreamCounts')(function* () {
			const noUpstream: {readonly ahead: number; readonly behind: number} | undefined = undefined
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(flow(String.trim, Option.some)),
				Effect.orElseSucceed(() => Option.none<string>())
			)
			if (Option.isNone(upstream)) return noUpstream

			return yield* pipe(
				git.string(config.cwd, ['rev-list', '--left-right', '--count', `${upstream.value}...HEAD`]),
				Effect.map(output => {
					const counts = pipe(output, String.trim, String.split(/\s+/u))
					return {
						ahead: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0),
						behind: Option.getOrElse(Number.parse(counts[0]), () => 0)
					}
				}),
				Effect.catchTag('GitError', () => Effect.succeed(noUpstream))
			)
		})

		const localBase = Effect.fn('GitReview.localBase')(function* () {
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(flow(String.trim, Option.some)),
				Effect.orElseSucceed(() => Option.none<string>())
			)

			if (Option.isSome(upstream)) return upstream.value

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			return yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)
		})

		const branchDiffBase = Effect.fn('GitReview.branchDiffBase')(function* () {
			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			return yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)
		})

		const aggregateDiffs = Effect.fn('GitReview.aggregateDiffs')(function* (base: string) {
			const trackedDiffs = yield* gitDiffs({args: [base], segments: Array.empty()})
			const untracked = yield* untrackedDiffs
			return Array.appendAll(trackedDiffs, untracked)
		})

		const prReviewComments = Effect.gen(function* () {
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
					Array.map(
						thread.comments.nodes,
						comment =>
							new GitReviewComment({
								body: comment.body,
								filePath: comment.path,
								lineNumber: comment.line ?? comment.originalLine ?? 1,
								resolved: thread.isResolved,
								side: thread.diffSide === 'LEFT' ? 'deletions' : 'additions',
								source: 'github',
								threadId: thread.id,
								url: comment.url
							})
					)
				)
			)
		}).pipe(Effect.withSpan('GitReview.reviewComments', {attributes: {cwd: config.cwd}}))

		const githubComments = Effect.fnUntraced(function* () {
			const cached = yield* Ref.get(githubCommentsRef)
			if (Option.isSome(cached)) return cached.value

			const comments = yield* pipe(
				prReviewComments,
				Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitReviewComment>()))
			)
			yield* Ref.set(githubCommentsRef, Option.some(comments))
			return comments
		})

		const reviewState = Effect.fn('GitReview.reviewState')(function* () {
			const current = yield* SubscriptionRef.get(state)
			const github = yield* githubComments()

			return new GitReviewState({
				comments: pipe(
					Array.appendAll(current.comments, github),
					Array.filter(comment => !isReviewExcludedPath(comment.filePath))
				),
				marks: Array.filter(current.marks, mark => !isReviewExcludedPath(mark.filePath))
			})
		})

		const worktreeChanges = yield* pipe(
			fs.watch(config.cwd),
			Stream.catch(() => Stream.empty),
			Stream.debounce(Duration.millis(50)),
			Stream.mapEffect(() =>
				pipe(
					git.lines(config.cwd, ['status', '--porcelain']),
					Effect.map(lines =>
						Array.some(lines, line => {
							const filePath = String.trim(String.slice(3)(line))
							return String.isNonEmpty(filePath) && !isReviewExcludedPath(filePath)
						})
					),
					Effect.orElseSucceed(() => true)
				)
			),
			Stream.filter(changed => changed),
			Stream.map(() => void 0),
			Stream.share({capacity: 16, idleTimeToLive: Duration.seconds(30), replay: 0, strategy: 'sliding'})
		)

		const metadata = Effect.fn('GitReview.metadata')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const branch = yield* currentBranch
			const defaultBranch = yield* defaultBranchName
			const branchBaseRef = yield* branchDiffBase()
			const localBaseRef = yield* localBase()
			const localCommits = yield* commitsBetween(localBaseRef, 'HEAD')
			const branchCommitCandidates =
				branch === defaultBranch ? yield* firstParentCommits : yield* commits(branchBaseRef)
			const localCommitHashes = new Set(Array.map(localCommits, commit => commit.hash))
			const branchCommits = Array.filter(branchCommitCandidates, commit => !localCommitHashes.has(commit.hash))

			return new GitReviewMetadata({
				branchCommits,
				dirty: yield* hasWorktreeChanges,
				localCommits,
				prUrl: Option.getOrUndefined(yield* branchPrUrl),
				unpushedCommits: yield* hasPushableCommits,
				upstream: yield* upstreamCounts()
			})
		})

		return {
			commits,
			mark: Effect.fn('GitReview.mark')(function* (marks: readonly GitReviewMark[]) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, markCount: Array.length(marks)})
				yield* SubscriptionRef.update(state, current => gitReviewStateMark(current, marks))
			}),
			metadata,
			resolveComment: Effect.fn('GitReview.resolveComment')(function* (input: {
				readonly filePath: string
				readonly lineNumber: number
				readonly side?: 'additions' | 'deletions'
			}) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, filePath: input.filePath})
				yield* SubscriptionRef.update(state, current => gitReviewStateResolveComment(current, input))
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
				yield* Ref.set(githubCommentsRef, Option.none())
			}),
			reviewDiffs,
			reviewState,
			saveComment: Effect.fn('GitReview.saveComment')(function* (comment: GitReviewComment) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, filePath: comment.filePath})
				yield* SubscriptionRef.update(state, current => gitReviewStateSaveComment(current, comment))
			}),
			unmark: Effect.fn('GitReview.unmark')(function* (marks: readonly GitReviewMark[]) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, markCount: Array.length(marks)})
				yield* SubscriptionRef.update(state, current => gitReviewStateUnmark(current, marks))
			}),
			watchReviewDiffs: (target: GitReviewTarget) => {
				const diffs = pipe(
					reviewDiffs(target),
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
			},
			watchReviewMetadata: () =>
				pipe(
					Stream.fromEffect(metadata()),
					Stream.concat(
						pipe(
							worktreeChanges,
							Stream.mapEffect(() => metadata())
						)
					),
					Stream.changes
				),
			watchReviewState: () =>
				pipe(
					SubscriptionRef.changes(state),
					Stream.mapEffect(() => reviewState()),
					Stream.changes
				)
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
	public static layerMock(input: GitReviewMock = {}) {
		return Layer.effect(
			this,
			Effect.gen(function* () {
				const state = yield* SubscriptionRef.make(
					input.initialState ?? new GitReviewState({comments: Array.empty(), marks: Array.empty()})
				)

				return {
					commits: Effect.fn('GitReview.mock.commits')(function* (base: string) {
						if (input.commits !== undefined) return yield* input.commits(base)
						return []
					}),
					mark: Effect.fn('GitReview.mock.mark')(function* (marks: readonly GitReviewMark[]) {
						yield* SubscriptionRef.update(state, current => gitReviewStateMark(current, marks))
					}),
					metadata: Effect.fn('GitReview.mock.metadata')(function* () {
						if (input.metadata !== undefined) return yield* input.metadata()
						return new GitReviewMetadata({branchCommits: [], dirty: false, localCommits: [], unpushedCommits: false})
					}),
					resolveComment: Effect.fn('GitReview.mock.resolveComment')(function* (comment: {
						readonly filePath: string
						readonly lineNumber: number
						readonly side?: 'additions' | 'deletions'
					}) {
						yield* SubscriptionRef.update(state, current => gitReviewStateResolveComment(current, comment))
					}),
					resolveReviewThread: Effect.fn('GitReview.mock.resolveReviewThread')(function* (threadId: string) {
						if (input.resolveReviewThread !== undefined) yield* input.resolveReviewThread(threadId)
					}),
					reviewDiffs: Effect.fn('GitReview.mock.reviewDiffs')(function* (target: GitReviewTarget) {
						if (input.reviewDiffs !== undefined) return yield* input.reviewDiffs(target)
						return []
					}),
					reviewState: Effect.fn('GitReview.mock.reviewState')(function* () {
						const current = yield* SubscriptionRef.get(state)
						const github = input.reviewComments === undefined ? [] : yield* input.reviewComments

						return new GitReviewState({comments: Array.appendAll(current.comments, github), marks: current.marks})
					}),
					saveComment: Effect.fn('GitReview.mock.saveComment')(function* (comment: GitReviewComment) {
						yield* SubscriptionRef.update(state, current => gitReviewStateSaveComment(current, comment))
					}),
					unmark: Effect.fn('GitReview.mock.unmark')(function* (marks: readonly GitReviewMark[]) {
						yield* SubscriptionRef.update(state, current => gitReviewStateUnmark(current, marks))
					}),
					watchReviewDiffs: (target: GitReviewTarget) => {
						if (input.watchReviewDiffs !== undefined) return input.watchReviewDiffs(target)
						return Stream.fromEffect(
							input.reviewDiffs === undefined
								? Effect.succeed([])
								: pipe(
										input.reviewDiffs(target),
										Effect.catchTag('GitError', () => Effect.succeed([]))
									)
						)
					},
					watchReviewMetadata: () => {
						if (input.watchReviewMetadata !== undefined) return input.watchReviewMetadata()
						return Stream.fromEffect(
							input.metadata === undefined
								? Effect.succeed(
										new GitReviewMetadata({branchCommits: [], dirty: false, localCommits: [], unpushedCommits: false})
									)
								: input.metadata()
						)
					},
					watchReviewState: () => {
						if (input.watchReviewState !== undefined) return input.watchReviewState()
						const current = Effect.gen(function* () {
							const local = yield* SubscriptionRef.get(state)
							const github = input.reviewComments === undefined ? [] : yield* input.reviewComments

							return new GitReviewState({comments: Array.appendAll(local.comments, github), marks: local.marks})
						})

						return Stream.fromEffect(current).pipe(
							Stream.concat(Stream.drop(1)(SubscriptionRef.changes(state)).pipe(Stream.mapEffect(() => current)))
						)
					}
				}
			})
		)
	}
}

export class GitPublish extends Context.Service<GitPublish>()('@deslop/git/service/GitPublish', {
	make: Effect.fn('GitPublish.make')(function* (config: {readonly cwd: string}) {
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
		const branchBase = Effect.fn('GitPublish.branchBase')(function* (defaultBranch: string) {
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
		const currentPullRequest = pipe(
			ghString(['pr', 'view', '--json', 'url']),
			Effect.flatMap(
				flow(
					Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubPullRequestViewResponse)),
					Effect.mapError(cause => new GitError({cause, message: 'Failed to parse current pull request.'}))
				)
			),
			Effect.flatMap(pr =>
				String.isNonEmpty(pr.url ?? '')
					? Effect.succeed(Option.some(new GitPullRequest({url: pr.url ?? ''})))
					: Effect.succeed(Option.none<GitPullRequest>())
			),
			Effect.catchTag('GitError', () => Effect.succeed(Option.none<GitPullRequest>()))
		)
		const pushableCommitCount = Effect.fn('GitPublish.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(flow(String.trim, Option.some)),
				Effect.orElseSucceed(() => Option.none<string>())
			)

			if (Option.isSome(upstream)) {
				return yield* pipe(
					git.string(config.cwd, ['rev-list', '--count', `${upstream.value}..HEAD`]),
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
				return String.isNonEmpty(url) ? Option.some(new GitPullRequest({url})) : Option.none<GitPullRequest>()
			})
		)
		const commit = Effect.fn('GitPublish.commit')(function* (message: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const dirty = yield* hasWorktreeChanges
			yield* Effect.annotateCurrentSpan({dirty})

			if (!dirty) return yield* new GitError({message: 'No changes to commit.'})
			if (String.isEmpty(String.trim(message))) {
				return yield* new GitError({message: 'Commit message required.'})
			}

			yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid, Effect.withSpan('GitPublish.stageAll'))
			yield* pipe(
				git.stringWithInput(config.cwd, ['commit', '-F', '-'], message),
				Effect.asVoid,
				Effect.withSpan('GitPublish.createCommit')
			)
		})
		const push = Effect.fn('GitPublish.push')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			if (!(yield* hasPushableCommits)) return yield* new GitError({message: 'No unpushed commits.'})

			const branch = yield* currentBranch
			yield* Effect.annotateCurrentSpan({branch})
			yield* pipe(
				git.string(config.cwd, ['push', '-u', 'origin', `HEAD:${branch}`]),
				Effect.asVoid,
				Effect.withSpan('GitPublish.push', {attributes: {branch, cwd: config.cwd}})
			)
			if (yield* hasPushableCommits) {
				return yield* new GitError({message: 'Push completed but the branch still has unpushed commits.'})
			}
		})
		const upsertDraftPullRequest = Effect.fn('GitPublish.upsertDraftPullRequest')(function* () {
			const branch = yield* currentBranch
			const defaultBranch = yield* defaultBranchName
			if (branch === defaultBranch) return Option.none<GitPullRequest>()

			const existing = yield* currentPullRequest
			if (Option.isSome(existing)) return existing

			return yield* pipe(
				createDraftPr,
				Effect.withSpan('GitPublish.createDraftPr', {attributes: {branch, cwd: config.cwd}})
			)
		})

		return {
			approve: Effect.fn('GitPublish.approve')(function* (input: {readonly message: string}) {
				const dirty = yield* hasWorktreeChanges
				if (dirty) yield* commit(input.message)
				if (!(yield* hasPushableCommits)) {
					return yield* new GitError({message: 'No changes or unpushed commits to publish.'})
				}
				yield* push()
				return Option.getOrUndefined(yield* upsertDraftPullRequest())
			})
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
	public static layerMock(input: GitPublishMock = {}) {
		return Layer.effect(
			this,
			Effect.gen(function* () {
				const current = yield* Ref.make<GitPullRequest | undefined>(input.current)

				return {
					approve: Effect.fn('GitPublish.mock.approve')(function* (payload: {readonly message: string}) {
						if (input.approve !== undefined) return yield* input.approve(payload)
						return yield* Ref.get(current)
					})
				}
			})
		)
	}
}
