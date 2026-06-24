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
	HashSet,
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
	Function,
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
	GitReviewFileEntry,
	GitReviewMetadata,
	GitReviewState,
	GitRepository,
	type GitReviewMark,
	type GitReviewTarget,
	type GitReviewViewMode,
	type GitWorktreeSource,
	GitWorktree,
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

const excludedDiscoveryEntries = HashSet.fromIterable(['.git', 'build', 'dist', 'node_modules', 'target'])
const excludedHomeDiscoveryEntries = HashSet.fromIterable([
	'Applications',
	'Library',
	'Movies',
	'Music',
	'Pictures',
	'Public'
])
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
	for (const index of Array.range(0, parts.length - 2)) {
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
const emptyGitPullRequests = [] satisfies GitPullRequest[]
const emptyGitReviewCommentLists = [] satisfies readonly (readonly GitReviewComment[])[]
const emptyStrings = [] satisfies string[]

function normalizePublicPath(value: string) {
	return String.startsWith('/private/var/')(value) ? String.replace(/^\/private/u, '')(value) : value
}

function pathSlug(value: string) {
	const slug = pipe(value, String.toLowerCase, String.replace(/[^a-z0-9-]+/gu, '-'), String.replace(/^-+|-+$/gu, ''))
	return slug === '' ? 'worktree' : slug
}

function repositorySlug(root: string) {
	const realRoot = NodeFs.realpathSync.native(root)
	const hash = pipe(createHash('sha256').update(realRoot).digest('hex'), String.slice(0, 10))
	return `${pathSlug(Option.getOrElse(Array.last(String.split('/')(realRoot)), () => realRoot))}-${hash}`
}

function branchSlug(branch: string) {
	return pathSlug(branch)
}

function firstWorktreeRoot(worktrees: readonly {readonly root: string}[], fallback: string) {
	return pipe(
		Array.head(worktrees),
		Option.map(worktree => worktree.root),
		Option.getOrElse(() => fallback)
	)
}

function validWorkbenchBranch(branch: string) {
	return /^(feat|fix|refactor|perf|test|docs|chore)\/[a-z0-9-]+$/u.test(branch)
}

function sameProjectSnapshot(left: readonly GitProject[], right: readonly GitProject[]) {
	if (Array.length(left) !== Array.length(right)) return false
	return Array.every(left, (leftProject, projectIndex) => {
		const rightProject = right[projectIndex]
		if (Predicate.isUndefined(rightProject)) return false
		if (
			leftProject.repository.gitDirectory !== rightProject.repository.gitDirectory ||
			leftProject.repository.root !== rightProject.repository.root ||
			Array.length(leftProject.worktrees) !== Array.length(rightProject.worktrees)
		) {
			return false
		}

		return Array.every(leftProject.worktrees, (leftWorktree, worktreeIndex) => {
			const rightWorktree = rightProject.worktrees[worktreeIndex]
			if (Predicate.isUndefined(rightWorktree)) return false
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
		HashMap.set(
			groups,
			segment.filePath,
			pipe(
				HashMap.get(groups, segment.filePath),
				Option.getOrElse(() => Array.empty<GitDiffSegment>()),
				Array.append(segment)
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

	return GitDiff.make({
		filePath,
		patch: chunk,
		segments: Option.getOrElse(HashMap.get(segments, filePath), () => Array.empty()),
		status
	})
}

function withDisplayedPatchSegments(diffs: readonly GitDiff[], id: string, type: 'commit' | 'worktree') {
	return Array.map(diffs, diff =>
		GitDiff.make({
			fileContent: diff.fileContent,
			filePath: diff.filePath,
			patch: diff.patch,
			segments: Predicate.isString(diff.patch)
				? [GitDiffSegment.make({filePath: diff.filePath, fingerprint: diff.patch, id, type})]
				: diff.segments,
			status: diff.status
		})
	)
}

function untrackedDiffFromContent(filePath: string, content: string) {
	const patch = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${pipe(
		String.split('\n')(content),
		Array.map(line => `+${line}`),
		Array.join('\n')
	)}`

	return GitDiff.make({
		filePath,
		patch,
		segments: [GitDiffSegment.make({filePath, fingerprint: patch, id: 'HEAD->worktree', type: 'worktree'})],
		status: 'added'
	})
}

function reviewPathspec(viewMode: GitReviewViewMode) {
	return viewMode === 'filtered' ? ['--', '.', ...reviewExclusionPathspecs] : ['--', '.']
}

function includeReviewEntry(viewMode: GitReviewViewMode, entry: GitReviewFileEntry) {
	if (viewMode === 'unfiltered') return true
	return !isReviewExcludedPath(entry.filePath)
}

function statusFromNameStatus(code: string) {
	if (String.startsWith('A')(code)) return 'added' as const
	if (String.startsWith('D')(code)) return 'deleted' as const
	if (String.startsWith('R')(code)) return 'renamed' as const
	return 'modified' as const
}

function entryFromNameStatus(line: string) {
	const fields = String.split('\t')(line)
	const code = fields[0]
	const filePath = String.startsWith('R')(code) ? (fields[2] ?? fields[1] ?? '') : (fields[1] ?? '')

	return Array.head(
		String.isEmpty(filePath) ? [] : [GitReviewFileEntry.make({filePath, status: statusFromNameStatus(code)})]
	)
}

function changedEntriesFromNameStatus(lines: readonly string[], viewMode: GitReviewViewMode) {
	return pipe(
		lines,
		Array.filter(String.isNonEmpty),
		Array.map(entryFromNameStatus),
		Array.getSomes,
		Array.filter(entry => includeReviewEntry(viewMode, entry))
	)
}

function mergeEntries(left: readonly GitReviewFileEntry[], right: readonly GitReviewFileEntry[]) {
	return pipe(
		Array.appendAll(left, right),
		Array.reduce(HashMap.empty<string, GitReviewFileEntry>(), (entries, entry) =>
			HashMap.set(entries, entry.filePath, entry)
		),
		HashMap.values,
		Array.fromIterable,
		Array.sortWith(entry => entry.filePath, Order.String)
	)
}

function sameFileEntries(left: readonly GitReviewFileEntry[], right: readonly GitReviewFileEntry[]) {
	return (
		Array.length(left) === Array.length(right) &&
		Array.every(
			left,
			(leftEntry, index) =>
				Predicate.isNotUndefined(right[index]) &&
				leftEntry.filePath === right[index].filePath &&
				leftEntry.revision === right[index].revision &&
				leftEntry.status === right[index].status
		)
	)
}

function commitFromLogLine(line: string) {
	const parts = String.split('\u0000')(line)

	return GitCommit.make({hash: parts[0], shortHash: parts[1] ?? '', subject: parts[2] ?? ''})
}

function parseWorktreeRecords(output: string) {
	const parsed = Array.reduce(
		String.split('\u0000')(output),
		{
			current: {branch: '', hasHead: false, root: ''},
			records: Array.empty<{branch: string; hasHead: boolean; root: string}>()
		},
		(state, field) => {
			if (String.startsWith('worktree ')(field)) {
				return {
					current: {branch: '', hasHead: false, root: String.replace(/^worktree\s+/u, '')(field)},
					records:
						String.isNonEmpty(state.current.root) && state.current.hasHead
							? Array.append(state.records, state.current)
							: state.records
				}
			}
			if (String.startsWith('HEAD ')(field)) return {...state, current: {...state.current, hasHead: true}}
			if (String.startsWith('branch refs/heads/')(field)) {
				return {...state, current: {...state.current, branch: String.replace(/^branch\s+refs\/heads\//u, '')(field)}}
			}
			return state
		}
	)

	return String.isNonEmpty(parsed.current.root) && parsed.current.hasHead
		? Array.append(parsed.records, parsed.current)
		: parsed.records
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
			const mergedBranches = HashSet.fromIterable(
				yield* git.lines(cwd, ['branch', '--merged', `origin/${defaultBranch}`, '--format=%(refname:short)'])
			)
			const branchLines = yield* git.lines(cwd, [
				'for-each-ref',
				'refs/heads',
				'--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(worktreepath)'
			])

			const fixBranch = Effect.fn('GitWorkspace.fixBranch')(function* (branchLine: string) {
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
					if (!HashSet.has(mergedBranches, branch)) return
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
			return Array.head(NodeFs.existsSync(path.join(root, '.git', 'HEAD')) ? [normalizePublicPath(root)] : [])
		})
		const repositorySearchRoots = Effect.fn('GitWorkspace.repositorySearchRoots')(function* (root: string) {
			if (root !== home) return [root]

			const entries = yield* pipe(
				fs.readDirectory(root),
				Effect.orElseSucceed(() => Array.empty<string>())
			)
			return yield* pipe(
				entries,
				Array.filter(entry => !HashSet.has(excludedHomeDiscoveryEntries, entry)),
				Array.filter(entry => !HashSet.has(excludedDiscoveryEntries, entry)),
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
				Array.sortWith(Function.identity, Order.String)
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
				Effect.map(repository =>
					GitRepository.make({
						gitDirectory: repository.gitDirectory,
						root: normalizePublicPath(firstWorktreeRoot(repository.worktrees, root))
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
				Array.map(worktree =>
					GitWorktree.make({
						branch: String.isNonEmpty(worktree.branch) ? worktree.branch : undefined,
						root: normalizePublicPath(worktree.root)
					})
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
										Effect.map(discoveredWorktrees =>
											GitProject.make({
												repository: GitRepository.make({
													gitDirectory: repository.gitDirectory,
													root: firstWorktreeRoot(discoveredWorktrees, repository.root)
												}),
												worktrees: Array.sortWith(
													discoveredWorktrees,
													worktree =>
														`${worktree.root === firstWorktreeRoot(discoveredWorktrees, repository.root) ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
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
		const refreshProjects = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: home})
			const next = yield* listProjectsFrom(home)
			const current = yield* SubscriptionRef.get(projects)
			if (!sameProjectSnapshot(current, next)) yield* SubscriptionRef.set(projects, next)
		})
		yield* refreshProjects

		return {
			branches: Effect.fn('GitWorkspace.branches')(function* (cwd: string) {
				yield* Effect.annotateCurrentSpan({cwd})
				return GitBranchesSnapshot.make({
					branches: yield* pipe(
						git.lines(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
						Effect.map(Array.map(name => GitBranch.make({name, type: 'local'}))),
						Effect.flatMap(localBranches =>
							pipe(
								git.lines(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']),
								Effect.map(lines =>
									pipe(
										lines,
										Array.filter(name => !String.endsWith('/HEAD')(name)),
										Array.map(name =>
											GitBranch.make({
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
				const createFromNewSource = Effect.gen(function* () {
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
					Match.orElse(() => createFromNewSource)
				)
				yield* refreshProjects
				return yield* createdWorktreeRoot
			}),
			deleteWorktree: Effect.fn('GitWorkspace.deleteWorktree')(function* (input: {readonly cwd: string}) {
				yield* Effect.annotateCurrentSpan({cwd: input.cwd})
				const worktrees = yield* pipe(
					git.string(input.cwd, ['worktree', 'list', '--porcelain', '-z']),
					Effect.map(parseWorktreeRecords)
				)
				const mainRoot = firstWorktreeRoot(worktrees, input.cwd)

				yield* pipe(git.string(mainRoot, ['worktree', 'remove', '--force', input.cwd]), Effect.asVoid)

				yield* pipe(
					worktrees,
					Array.findFirst(worktree => worktree.root === input.cwd),
					Option.flatMap(worktree => Option.fromUndefinedOr(worktree.branch)),
					Option.match({
						onNone: () => Effect.void,
						onSome: branch => pipe(git.string(mainRoot, ['branch', '-D', branch]), Effect.ignore)
					})
				)
				yield* refreshProjects
			}),
			fix: Effect.fn('GitWorkspace.fix')(function* (cwd: string) {
				yield* fixProject(cwd)
				yield* refreshProjects
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
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const state = yield* SubscriptionRef.make(GitReviewState.make({comments: [], marks: []}))
		const githubCommentsRef = yield* Ref.make<Option.Option<readonly GitReviewComment[]>>(
			Array.head(emptyGitReviewCommentLists)
		)

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
			readonly filePath?: string
			readonly segments: readonly GitDiffSegment[]
			readonly viewMode?: GitReviewViewMode
		}) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, segmentCount: Array.length(input.segments)})
			const pathspec = Predicate.isUndefined(input.filePath)
				? reviewPathspec(input.viewMode ?? 'filtered')
				: ['--', input.filePath]
			const patch = yield* git.string(config.cwd, [
				'diff',
				...input.args,
				'--ignore-all-space',
				'--ignore-blank-lines',
				'--ignore-cr-at-eol',
				'--patch',
				'--find-renames',
				'--no-ext-diff',
				...pathspec
			])

			const diffs = pipe(
				diffsFromPatch(patch, input.segments),
				Array.filter(diff => includeReviewEntry(input.viewMode ?? 'filtered', GitReviewFileEntry.make(diff)))
			)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffs)})
			return diffs
		})

		const commitDiffs = Effect.fn('GitReview.commitDiffs')(function* (
			hash: string,
			viewMode: GitReviewViewMode = 'filtered'
		) {
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
			const pathspec = reviewPathspec(viewMode)
			const parents = yield* pipe(
				git.string(config.cwd, ['rev-list', '--parents', '-n', '1', hash]),
				Effect.map(flow(String.trim, String.split(/\s+/u)))
			)
			const patch = yield* pipe(
				Array.length(parents) > 2
					? git.string(config.cwd, ['show', '--remerge-diff', '--format=', ...Array.drop(args, 1), hash, ...pathspec])
					: git.string(config.cwd, ['diff-tree', ...args, hash, ...pathspec]),
				Effect.flatMap(output => {
					if (/^diff --git /mu.test(output)) return Effect.succeed(output)
					if (Array.length(parents) > 2) return Effect.succeed(output)

					const parent = parents[1]
					if (Predicate.isUndefined(parent)) return Effect.succeed(output)

					return git.string(config.cwd, ['diff-tree', ...args, parent, hash, ...pathspec])
				})
			)
			const diffs = pipe(
				diffsFromPatch(patch, Array.empty()),
				Array.filter(diff => includeReviewEntry(viewMode, GitReviewFileEntry.make(diff)))
			)
			yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffs)})
			return diffs
		})

		const untrackedDiffs = Effect.fn('GitReview.untrackedDiffs')(function* (viewMode: GitReviewViewMode) {
			return yield* pipe(
				git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard']),
				Effect.map(Array.filter(filePath => (viewMode === 'unfiltered' ? true : !isReviewExcludedPath(filePath)))),
				Effect.flatMap(files =>
					Effect.forEach(
						files,
						filePath =>
							pipe(
								fs.readFileString(path.join(config.cwd, filePath)),
								Effect.orElseSucceed(() => ''),
								Effect.map(content => untrackedDiffFromContent(filePath, content))
							),
						{concurrency: 'unbounded'}
					)
				)
			)
		})

		const untrackedDiffForFile = Effect.fn('GitReview.untrackedDiffForFile')(function* (filePath: string) {
			const files = yield* git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard', '--', filePath])
			if (!Array.some(files, file => file === filePath)) return

			return yield* pipe(
				fs.readFileString(path.join(config.cwd, filePath)),
				Effect.orElseSucceed(() => ''),
				Effect.map(content => untrackedDiffFromContent(filePath, content))
			)
		})

		const unstagedDiffs = Effect.gen(function* () {
			const status = yield* git.lines(config.cwd, ['status', '--porcelain'])
			if (Array.isReadonlyArrayEmpty(status)) return Array.empty<GitDiff>()

			const diffs = yield* pipe(
				Effect.all([gitDiffs({args: [], segments: Array.empty(), viewMode: 'filtered'}), untrackedDiffs('filtered')], {
					concurrency: 'unbounded'
				}),
				Effect.map(([trackedDiffs, untracked]) =>
					Array.appendAll(
						Array.map(trackedDiffs, diff => {
							const segment = GitDiffSegment.make({
								filePath: diff.filePath,
								fingerprint: diff.patch ?? '',
								id: 'HEAD->worktree',
								type: 'worktree'
							})

							return GitDiff.make({
								filePath: diff.filePath,
								patch: diff.patch,
								segments: [segment],
								status: diff.status
							})
						}),
						untracked
					)
				)
			)

			return diffs
		}).pipe(Effect.withSpan('GitReview.unstagedDiffs', {attributes: {cwd: config.cwd}}))

		const stagedDiffs = Effect.gen(function* () {
			const diffs = yield* gitDiffs({args: ['--cached'], segments: Array.empty(), viewMode: 'filtered'})
			return pipe(
				diffs,
				Array.map(diff => {
					const segment = GitDiffSegment.make({
						filePath: diff.filePath,
						fingerprint: diff.patch ?? '',
						id: 'HEAD->index',
						type: 'worktree'
					})

					return GitDiff.make({...diff, segments: Predicate.isString(diff.patch) ? [segment] : diff.segments})
				})
			)
		}).pipe(Effect.withSpan('GitReview.stagedDiffs', {attributes: {cwd: config.cwd}}))

		const worktreeDiffs = Effect.gen(function* () {
			const status = yield* git.lines(config.cwd, ['status', '--porcelain'])
			if (Array.isReadonlyArrayEmpty(status)) return Array.empty<GitDiff>()

			const diffs = yield* pipe(
				Effect.all(
					[gitDiffs({args: ['HEAD'], segments: Array.empty(), viewMode: 'filtered'}), untrackedDiffs('filtered')],
					{concurrency: 'unbounded'}
				),
				Effect.map(([trackedDiffs, untracked]) => Array.appendAll(trackedDiffs, untracked))
			)

			return withDisplayedPatchSegments(diffs, 'HEAD->worktree', 'worktree')
		}).pipe(Effect.withSpan('GitReview.worktreeDiffs', {attributes: {cwd: config.cwd}}))

		const fileContent = Effect.fn('GitReview.fileContent')(function* (input: {
			readonly filePath: string
			readonly target: GitReviewTarget
		}) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, filePath: input.filePath, target: input.target._tag})
			return yield* Match.value(input.target).pipe(
				Match.when({_tag: 'staged'}, () =>
					pipe(
						git.string(config.cwd, ['show', `:${input.filePath}`]),
						Effect.orElseSucceed(() => '')
					)
				),
				Match.when({_tag: 'commit'}, target =>
					pipe(
						git.string(config.cwd, ['show', `${target.hash}:${input.filePath}`]),
						Effect.orElseSucceed(() => '')
					)
				),
				Match.orElse(() =>
					pipe(
						fs.readFileString(path.join(config.cwd, input.filePath)),
						Effect.orElseSucceed(() => '')
					)
				)
			)
		})

		const untrackedEntries = Effect.fn('GitReview.untrackedEntries')(function* (viewMode: GitReviewViewMode) {
			const files = yield* git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard'])
			return yield* pipe(
				files,
				Array.map(filePath => GitReviewFileEntry.make({filePath, status: 'added'})),
				Array.filter(entry => includeReviewEntry(viewMode, entry)),
				Effect.forEach(entry =>
					pipe(
						fs.readFileString(path.join(config.cwd, entry.filePath)),
						Effect.map(content =>
							GitReviewFileEntry.make({
								...entry,
								revision: untrackedDiffFromContent(entry.filePath, content).patch ?? content
							})
						),
						Effect.orElseSucceed(() => entry)
					)
				)
			)
		})

		const trackedFileEntries = Effect.gen(function* () {
			const files = yield* git.lines(config.cwd, ['ls-files', '--cached'])
			return Array.map(files, filePath => GitReviewFileEntry.make({filePath, status: 'unchanged' as const}))
		}).pipe(Effect.withSpan('GitReview.trackedFileEntries', {attributes: {cwd: config.cwd}}))

		const patchRevisionByFile = Effect.fn('GitReview.patchRevisionByFile')(function* (
			args: readonly string[],
			viewMode: GitReviewViewMode
		) {
			const diffs = yield* gitDiffs({args, segments: Array.empty(), viewMode})
			return pipe(
				diffs,
				Array.reduce(HashMap.empty<string, string>(), (revisions, diff) =>
					Predicate.isString(diff.patch) ? HashMap.set(revisions, diff.filePath, diff.patch) : revisions
				)
			)
		})

		const nameStatusEntries = Effect.fn('GitReview.nameStatusEntries')(function* (
			args: readonly string[],
			viewMode: GitReviewViewMode
		) {
			const entries = yield* pipe(
				git.lines(config.cwd, ['diff', '--name-status', '--find-renames', ...args, ...reviewPathspec(viewMode)]),
				Effect.map(lines => changedEntriesFromNameStatus(lines, viewMode))
			)
			const revisions = yield* patchRevisionByFile(args, viewMode)
			return Array.map(entries, entry =>
				GitReviewFileEntry.make({...entry, revision: Option.getOrUndefined(HashMap.get(revisions, entry.filePath))})
			)
		})

		const nameStatusEntryForFile = Effect.fn('GitReview.nameStatusEntryForFile')(function* (
			args: readonly string[],
			viewMode: GitReviewViewMode,
			filePath: string
		) {
			const pathEntries = yield* pipe(
				git.lines(config.cwd, ['diff', '--name-status', '--find-renames', ...args, '--', filePath]),
				Effect.map(lines => changedEntriesFromNameStatus(lines, viewMode))
			)
			const pathEntry = pipe(
				pathEntries,
				Array.findFirst(entry => entry.filePath === filePath),
				Option.getOrUndefined
			)
			if (Predicate.isUndefined(pathEntry)) return
			if (pathEntry.status !== 'added') {
				const revision = yield* pipe(
					gitDiffs({args, filePath, segments: Array.empty(), viewMode}),
					Effect.map(diffs =>
						pipe(
							diffs,
							Array.findFirst(diff => diff.filePath === filePath),
							Option.flatMap(diff => Option.fromUndefinedOr(diff.patch)),
							Option.getOrUndefined
						)
					)
				)
				return GitReviewFileEntry.make({...pathEntry, revision})
			}

			return pipe(
				yield* nameStatusEntries(args, viewMode),
				Array.findFirst(entry => entry.filePath === filePath),
				Option.getOrUndefined
			)
		})

		const untrackedEntryForFile = Effect.fn('GitReview.untrackedEntryForFile')(function* (
			viewMode: GitReviewViewMode,
			filePath: string
		) {
			const files = yield* git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard', '--', filePath])
			if (!Array.some(files, file => file === filePath)) return
			const entry = GitReviewFileEntry.make({filePath, status: 'added' as const})
			if (!includeReviewEntry(viewMode, entry)) return

			return yield* pipe(
				fs.readFileString(path.join(config.cwd, filePath)),
				Effect.map(content =>
					GitReviewFileEntry.make({...entry, revision: untrackedDiffFromContent(filePath, content).patch ?? content})
				),
				Effect.orElseSucceed(() => entry)
			)
		})

		const trackedFileEntryForFile = Effect.fn('GitReview.trackedFileEntryForFile')(function* (filePath: string) {
			const files = yield* git.lines(config.cwd, ['ls-files', '--cached', '--', filePath])
			if (!Array.some(files, file => file === filePath)) return
			return GitReviewFileEntry.make({filePath, status: 'unchanged' as const})
		})

		const worktreeFileEntries = Effect.fn('GitReview.worktreeFileEntries')(function* (viewMode: GitReviewViewMode) {
			const changed = yield* Effect.all([nameStatusEntries(['HEAD'], viewMode), untrackedEntries(viewMode)], {
				concurrency: 'unbounded'
			})
			if (viewMode === 'filtered') return mergeEntries(changed[0], changed[1])

			return mergeEntries(yield* trackedFileEntries, mergeEntries(changed[0], changed[1]))
		})

		const unstagedFileEntries = Effect.fn('GitReview.unstagedFileEntries')(function* (viewMode: GitReviewViewMode) {
			const changed = yield* Effect.all([nameStatusEntries([], viewMode), untrackedEntries(viewMode)], {
				concurrency: 'unbounded'
			})
			if (viewMode === 'filtered') return mergeEntries(changed[0], changed[1])

			return mergeEntries(yield* trackedFileEntries, mergeEntries(changed[0], changed[1]))
		})

		const stagedFileEntries = Effect.fn('GitReview.stagedFileEntries')(function* (viewMode: GitReviewViewMode) {
			const changed = yield* nameStatusEntries(['--cached'], viewMode)
			if (viewMode === 'filtered') return changed

			return mergeEntries(yield* trackedFileEntries, changed)
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
			const contentByFilePath = HashMap.fromIterable(contents)

			return Array.map(input.diffs, diff =>
				HashMap.has(contentByFilePath, diff.filePath)
					? GitDiff.make({
							fileContent: Option.getOrUndefined(HashMap.get(contentByFilePath, diff.filePath)),
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
			const changesDiffs = Effect.gen(function* () {
				return yield* withFileContent({diffs: yield* worktreeDiffs, target})
			})
			const unstagedTargetDiffs = Effect.gen(function* () {
				return yield* withFileContent({diffs: yield* unstagedDiffs, target})
			})
			const stagedTargetDiffs = Effect.gen(function* () {
				return yield* withFileContent({diffs: yield* stagedDiffs, target})
			})
			const aggregateTargetDiffs = Effect.gen(function* () {
				const base = target._tag === 'local' ? yield* localBase : yield* branchDiffBase
				const diffs = yield* aggregateDiffs(base)
				const diffsWithSegments = withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree')
				yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

				return yield* withFileContent({diffs: diffsWithSegments, target})
			})

			return yield* Match.value(target).pipe(
				Match.when({_tag: 'changes'}, () => changesDiffs),
				Match.when({_tag: 'unstaged'}, () => unstagedTargetDiffs),
				Match.when({_tag: 'staged'}, () => stagedTargetDiffs),
				Match.when({_tag: 'commit'}, commitTarget =>
					Effect.gen(function* () {
						const id = `${commitTarget.hash}^->${commitTarget.hash}`
						const diffs = yield* commitDiffs(commitTarget.hash)
						const diffsWithSegments = withDisplayedPatchSegments(diffs, id, 'commit')
						yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

						return yield* withFileContent({diffs: diffsWithSegments, target})
					})
				),
				Match.orElse(() => aggregateTargetDiffs)
			)
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
			Effect.map(url => Array.head(String.isNonEmpty(url) ? [url] : [])),
			Effect.catchTag('GitError', () => Effect.succeed(Array.head(emptyStrings)))
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

		const pushableCommitCount = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(String.trim),
				Effect.option
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
			pushableCommitCount,
			Effect.map(count => count > 0)
		)

		const upstreamCounts = Effect.gen(function* () {
			const noUpstream = undefined
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(String.trim),
				Effect.option
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

		const localBase = Effect.gen(function* () {
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(String.trim),
				Effect.option
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

		const branchDiffBase = Effect.gen(function* () {
			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			return yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)
		})

		const aggregateDiffs = Effect.fn('GitReview.aggregateDiffs')(function* (
			base: string,
			viewMode: GitReviewViewMode = 'filtered'
		) {
			const trackedDiffs = yield* gitDiffs({args: [base], segments: Array.empty(), viewMode})
			const untracked = yield* untrackedDiffs(viewMode)
			return Array.appendAll(trackedDiffs, untracked)
		})

		const commitFileEntries = Effect.fn('GitReview.commitFileEntries')(function* (
			hash: string,
			viewMode: GitReviewViewMode
		) {
			return pipe(
				yield* commitDiffs(hash, viewMode),
				Array.map(diff => GitReviewFileEntry.make({filePath: diff.filePath, status: diff.status}))
			)
		})

		const aggregateFileEntries = Effect.fn('GitReview.aggregateFileEntries')(function* (
			base: string,
			viewMode: GitReviewViewMode
		) {
			const changed = yield* Effect.all([nameStatusEntries([base], viewMode), untrackedEntries(viewMode)], {
				concurrency: 'unbounded'
			})
			if (viewMode === 'filtered') return mergeEntries(changed[0], changed[1])

			return mergeEntries(yield* trackedFileEntries, mergeEntries(changed[0], changed[1]))
		})

		const reviewFileEntries = Effect.fn('GitReview.reviewFileEntries')(function* (input: {
			readonly target: GitReviewTarget
			readonly viewMode: GitReviewViewMode
		}) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, target: input.target._tag, viewMode: input.viewMode})
			const localEntries = Effect.gen(function* () {
				return yield* aggregateFileEntries(yield* localBase, input.viewMode)
			})
			const branchEntries = Effect.gen(function* () {
				return yield* aggregateFileEntries(yield* branchDiffBase, input.viewMode)
			})

			return yield* Match.value(input.target).pipe(
				Match.when({_tag: 'changes'}, () => worktreeFileEntries(input.viewMode)),
				Match.when({_tag: 'unstaged'}, () => unstagedFileEntries(input.viewMode)),
				Match.when({_tag: 'staged'}, () => stagedFileEntries(input.viewMode)),
				Match.when({_tag: 'commit'}, target => commitFileEntries(target.hash, input.viewMode)),
				Match.when({_tag: 'local'}, () => localEntries),
				Match.orElse(() => branchEntries)
			)
		})

		const reviewFileEntryForPath = Effect.fn('GitReview.reviewFileEntryForPath')(function* (input: {
			readonly filePath: string
			readonly target: GitReviewTarget
			readonly viewMode: GitReviewViewMode
		}) {
			const changedEntry = Effect.fnUntraced(function* (args: readonly string[]) {
				return yield* nameStatusEntryForFile(args, input.viewMode, input.filePath)
			})
			const untrackedEntry = Effect.fnUntraced(function* () {
				return yield* untrackedEntryForFile(input.viewMode, input.filePath)
			})
			const visibleTrackedEntry = Effect.fnUntraced(function* () {
				if (input.viewMode !== 'unfiltered') return
				return yield* trackedFileEntryForFile(input.filePath)
			})
			const worktreeEntry = Effect.fnUntraced(function* (args: readonly string[]) {
				const entries = yield* Effect.all([changedEntry(args), untrackedEntry(), visibleTrackedEntry()], {
					concurrency: 'unbounded'
				})
				return pipe(entries, Array.findFirst(Predicate.isNotUndefined), Option.getOrUndefined)
			})
			const stagedEntry = Effect.gen(function* () {
				const entries = yield* Effect.all([changedEntry(['--cached']), visibleTrackedEntry()], {
					concurrency: 'unbounded'
				})
				return pipe(entries, Array.findFirst(Predicate.isNotUndefined), Option.getOrUndefined)
			})
			const localEntry = Effect.gen(function* () {
				return yield* worktreeEntry([yield* localBase])
			})
			const branchEntry = Effect.gen(function* () {
				return yield* worktreeEntry([yield* branchDiffBase])
			})

			return yield* Match.value(input.target).pipe(
				Match.when({_tag: 'changes'}, () => worktreeEntry(['HEAD'])),
				Match.when({_tag: 'unstaged'}, () => worktreeEntry([])),
				Match.when({_tag: 'staged'}, () => stagedEntry),
				Match.when({_tag: 'commit'}, target =>
					Effect.gen(function* () {
						const entries = yield* commitFileEntries(target.hash, input.viewMode)
						return pipe(
							entries,
							Array.findFirst(entry => entry.filePath === input.filePath),
							Option.getOrUndefined
						)
					})
				),
				Match.when({_tag: 'local'}, () => localEntry),
				Match.orElse(() => branchEntry)
			)
		})

		const diffForFile = Effect.fn('GitReview.diffForFile')(function* (input: {
			readonly entry: GitReviewFileEntry
			readonly filePath: string
			readonly target: GitReviewTarget
			readonly viewMode: GitReviewViewMode
		}) {
			const filePathspec = ['--', input.filePath]
			function findDiff(diffs: readonly GitDiff[]) {
				return pipe(
					diffs,
					Array.findFirst(diff => diff.filePath === input.filePath),
					Option.getOrUndefined
				)
			}
			const changesFileDiff = Effect.gen(function* () {
				const tracked = yield* gitDiffs({
					args: ['HEAD'],
					filePath: input.entry.status === 'renamed' ? undefined : input.filePath,
					segments: Array.empty(),
					viewMode: input.viewMode
				})
				const untracked = yield* untrackedDiffForFile(input.filePath)
				const diffs = Predicate.isUndefined(untracked) ? tracked : Array.appendAll(tracked, [untracked])
				return findDiff(withDisplayedPatchSegments(diffs, 'HEAD->worktree', 'worktree'))
			})
			const unstagedFileDiff = Effect.gen(function* () {
				const tracked =
					input.entry.status === 'renamed'
						? yield* gitDiffs({args: [], segments: Array.empty(), viewMode: input.viewMode})
						: yield* pipe(
								git.string(config.cwd, [
									'diff',
									'--ignore-all-space',
									'--ignore-blank-lines',
									'--ignore-cr-at-eol',
									'--patch',
									'--find-renames',
									'--no-ext-diff',
									...filePathspec
								]),
								Effect.map(patch => diffsFromPatch(patch, Array.empty()))
							)
				const untracked = yield* untrackedDiffForFile(input.filePath)
				const diffs = Predicate.isUndefined(untracked) ? tracked : Array.appendAll(tracked, [untracked])
				return findDiff(withDisplayedPatchSegments(diffs, 'index->worktree', 'worktree'))
			})
			const stagedFileDiff = Effect.gen(function* () {
				const tracked =
					input.entry.status === 'renamed'
						? yield* gitDiffs({args: ['--cached'], segments: Array.empty(), viewMode: input.viewMode})
						: yield* pipe(
								git.string(config.cwd, [
									'diff',
									'--cached',
									'--ignore-all-space',
									'--ignore-blank-lines',
									'--ignore-cr-at-eol',
									'--patch',
									'--find-renames',
									'--no-ext-diff',
									...filePathspec
								]),
								Effect.map(patch => diffsFromPatch(patch, Array.empty()))
							)
				return findDiff(withDisplayedPatchSegments(tracked, 'HEAD->index', 'worktree'))
			})
			const localFileDiff = Effect.gen(function* () {
				const base = yield* localBase
				const tracked = yield* gitDiffs({
					args: [base],
					filePath: input.entry.status === 'renamed' ? undefined : input.filePath,
					segments: Array.empty(),
					viewMode: input.viewMode
				})
				const untracked = yield* untrackedDiffForFile(input.filePath)
				const diffs = Predicate.isUndefined(untracked) ? tracked : Array.appendAll(tracked, [untracked])
				return findDiff(withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree'))
			})
			const branchFileDiff = Effect.gen(function* () {
				const base = yield* branchDiffBase
				const tracked = yield* gitDiffs({
					args: [base],
					filePath: input.entry.status === 'renamed' ? undefined : input.filePath,
					segments: Array.empty(),
					viewMode: input.viewMode
				})
				const untracked = yield* untrackedDiffForFile(input.filePath)
				const diffs = Predicate.isUndefined(untracked) ? tracked : Array.appendAll(tracked, [untracked])
				return findDiff(withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree'))
			})

			return yield* Match.value(input.target).pipe(
				Match.when({_tag: 'changes'}, () => changesFileDiff),
				Match.when({_tag: 'unstaged'}, () => unstagedFileDiff),
				Match.when({_tag: 'staged'}, () => stagedFileDiff),
				Match.when({_tag: 'commit'}, target =>
					Effect.gen(function* () {
						return findDiff(
							withDisplayedPatchSegments(
								yield* commitDiffs(target.hash, input.viewMode),
								`${target.hash}^->${target.hash}`,
								'commit'
							)
						)
					})
				),
				Match.when({_tag: 'local'}, () => localFileDiff),
				Match.orElse(() => branchFileDiff)
			)
		})

		const reviewFileContent = Effect.fn('GitReview.reviewFileContent')(function* (input: {
			readonly filePath: string
			readonly target: GitReviewTarget
			readonly viewMode: GitReviewViewMode
		}) {
			yield* Effect.annotateCurrentSpan({
				cwd: config.cwd,
				filePath: input.filePath,
				target: input.target._tag,
				viewMode: input.viewMode
			})
			const entry = yield* reviewFileEntryForPath(input)
			if (Predicate.isUndefined(entry)) {
				return yield* new GitError({message: 'File is not part of the current review.'})
			}
			const diff = yield* diffForFile({...input, entry})
			const content = diff?.status === 'deleted' ? undefined : yield* fileContent(input)

			return GitDiff.make({
				fileContent: content,
				filePath: input.filePath,
				patch: diff?.patch,
				segments: diff?.segments ?? [],
				status: diff?.status ?? entry.status
			})
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
					Array.map(thread.comments.nodes, comment =>
						GitReviewComment.make({
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
			yield* Ref.set(githubCommentsRef, Array.head([comments]))
			return comments
		})

		const reviewState = Effect.fn('GitReview.reviewState')(function* (viewMode: GitReviewViewMode) {
			const current = yield* SubscriptionRef.get(state)
			const github = yield* githubComments()
			if (viewMode === 'unfiltered') {
				return GitReviewState.make({comments: Array.appendAll(current.comments, github), marks: current.marks})
			}

			return GitReviewState.make({
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
					Effect.map(lines => !Array.isReadonlyArrayEmpty(lines)),
					Effect.orElseSucceed(() => true)
				)
			),
			Stream.filter(Function.identity),
			Stream.map(() => void 0),
			Stream.share({capacity: 16, idleTimeToLive: Duration.seconds(30), replay: 0, strategy: 'sliding'})
		)

		const metadata = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const branch = yield* currentBranch
			const defaultBranch = yield* defaultBranchName
			const branchBaseRef = yield* branchDiffBase
			const localBaseRef = yield* localBase
			const localCommits = yield* commitsBetween(localBaseRef, 'HEAD')
			const branchCommitCandidates =
				branch === defaultBranch ? yield* firstParentCommits : yield* commits(branchBaseRef)
			const localCommitHashes = pipe(
				localCommits,
				Array.map(commit => commit.hash),
				HashSet.fromIterable
			)
			const branchCommits = Array.filter(branchCommitCandidates, commit => !HashSet.has(localCommitHashes, commit.hash))

			return GitReviewMetadata.make({
				branchCommits,
				dirty: yield* hasWorktreeChanges,
				localCommits,
				prUrl: Option.getOrUndefined(yield* branchPrUrl),
				unpushedCommits: yield* hasPushableCommits,
				upstream: yield* upstreamCounts
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
			resolveReviewThread: Effect.fn('GitReview.resolveReviewThread')(function* (threadId) {
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
				yield* Ref.set(githubCommentsRef, Array.head(emptyGitReviewCommentLists))
			}),
			reviewDiffs,
			reviewFileContent,
			reviewFileEntries,
			reviewState,
			saveComment: Effect.fn('GitReview.saveComment')(function* (comment: GitReviewComment) {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd, filePath: comment.filePath})
				yield* SubscriptionRef.update(state, current => gitReviewStateSaveComment(current, comment))
			}),
			stageAll: pipe(
				git.string(config.cwd, ['add', '-A']),
				Effect.asVoid,
				Effect.withSpan('GitReview.stageAll', {attributes: {cwd: config.cwd}})
			),
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
			watchReviewFileEntries: (input: {readonly target: GitReviewTarget; readonly viewMode: GitReviewViewMode}) => {
				const entries = pipe(
					reviewFileEntries(input),
					Effect.catch(() => Effect.succeed(Array.empty<GitReviewFileEntry>()))
				)
				if (input.target._tag === 'commit') return Stream.fromEffect(entries)

				return Stream.fromEffect(entries).pipe(
					Stream.concat(
						pipe(
							worktreeChanges,
							Stream.mapEffect(() => entries)
						)
					),
					Stream.changesWith(sameFileEntries)
				)
			},
			watchReviewMetadata: () =>
				pipe(
					Stream.fromEffect(metadata),
					Stream.concat(
						pipe(
							worktreeChanges,
							Stream.mapEffect(() => metadata)
						)
					),
					Stream.changes
				),
			watchReviewState: (viewMode: GitReviewViewMode) =>
				pipe(
					SubscriptionRef.changes(state),
					Stream.mapEffect(() => reviewState(viewMode)),
					Stream.changes
				)
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
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
					? Effect.succeed(Array.head([GitPullRequest.make({url: pr.url ?? ''})]))
					: Effect.succeed(Array.head(emptyGitPullRequests))
			),
			Effect.catchTag('GitError', () => Effect.succeed(Array.head(emptyGitPullRequests)))
		)
		const pushableCommitCount = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(String.trim),
				Effect.option
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
			pushableCommitCount,
			Effect.map(count => count > 0)
		)
		const createDraftPr = pipe(
			ghString(['pr', 'create', '--draft', '--fill']),
			Effect.map(output => {
				const url = output.match(/https?:\/\/\S+/u)?.[0] ?? String.trim(output)
				return Array.head(String.isNonEmpty(url) ? [GitPullRequest.make({url})] : [])
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
		const push = Effect.gen(function* () {
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
		const upsertDraftPullRequest = Effect.gen(function* () {
			const branch = yield* currentBranch
			const defaultBranch = yield* defaultBranchName
			if (branch === defaultBranch) return Array.head(emptyGitPullRequests)

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
				yield* push
				return Option.getOrUndefined(yield* upsertDraftPullRequest)
			})
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}
