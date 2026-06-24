import {createHash, randomUUID} from 'node:crypto'
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
	GitError,
	GitProject,
	GitPullRequest,
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewComment,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	GitReviewMetadata,
	GitReviewState,
	GitRepository,
	type GitReviewCommentDraft,
	type GitReviewMark,
	type GitReviewTarget,
	type GitWorktreeSource,
	GitWorktree,
	gitReviewStateDeleteComments,
	gitReviewStateMark,
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
const reviewDiffFlags = ['--ignore-all-space', '--ignore-blank-lines', '--ignore-cr-at-eol'] as const
const checkpointCommit = {trailer: 'Deslop-Checkpoint: true'} as const
const emptyGitPullRequests = [] satisfies GitPullRequest[]

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
function parseWorktreeFields(
	fields: readonly string[],
	current: {readonly branch: string; readonly hasHead: boolean; readonly root: string},
	records: readonly {readonly branch: string; readonly hasHead: boolean; readonly root: string}[]
): readonly {readonly branch: string; readonly hasHead: boolean; readonly root: string}[] {
	const field = fields[0]
	if (Predicate.isUndefined(field)) {
		return String.isNonEmpty(current.root) && current.hasHead ? Array.append(records, current) : records
	}
	const rest = Array.drop(fields, 1)
	if (String.startsWith('worktree ')(field)) {
		return parseWorktreeFields(
			rest,
			{branch: '', hasHead: false, root: String.replace(/^worktree\s+/u, '')(field)},
			String.isNonEmpty(current.root) && current.hasHead ? Array.append(records, current) : records
		)
	}
	if (String.startsWith('HEAD ')(field)) {
		return parseWorktreeFields(rest, {...current, hasHead: true}, records)
	}
	if (String.startsWith('branch refs/heads/')(field)) {
		return parseWorktreeFields(
			rest,
			{...current, branch: String.replace(/^branch\s+refs\/heads\//u, '')(field)},
			records
		)
	}
	return parseWorktreeFields(rest, current, records)
}
function parseWorktreeRecords(output: string) {
	return parseWorktreeFields(String.split('\u0000')(output), {branch: '', hasHead: false, root: ''}, [])
}
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
function changeHash(value: string) {
	return createHash('sha256').update(value).digest('hex')
}
function patchPathspec() {
	return ['--', '.', ...reviewExclusionPathspecs]
}
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
	return GitDiff.make({changeHash: changeHash(chunk), filePath, patch: chunk, status})
}
function diffsFromPatch(patch: string) {
	return pipe(
		patch.split(/(?=^diff --git )/mu),
		Array.filter(chunk => /^diff --git /u.test(chunk)),
		Array.map(diffFromPatchChunk),
		Array.filter(diff => !isReviewExcludedPath(diff.filePath))
	)
}
function untrackedDiffFromContent(filePath: string, content: string) {
	const patch = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${pipe(
		String.split('\n')(content),
		Array.map(line => `+${line}`),
		Array.join('\n')
	)}`
	return GitDiff.make({changeHash: changeHash(patch), filePath, patch, status: 'added'})
}
function sameDiffs(left: readonly GitDiff[], right: readonly GitDiff[]) {
	return (
		Array.length(left) === Array.length(right) &&
		Array.every(
			left,
			(leftDiff, index) =>
				Predicate.isNotUndefined(right[index]) &&
				leftDiff.filePath === right[index].filePath &&
				leftDiff.status === right[index].status &&
				leftDiff.changeHash === right[index].changeHash &&
				leftDiff.fileContent === right[index].fileContent
		)
	)
}
function targetKey(target: GitReviewTarget) {
	return target._tag === 'commit' ? `commit:${target.hash}` : target._tag
}
function targetFromKey(key: string) {
	if (String.startsWith('commit:')(key)) return GitReviewCommitTarget.make({hash: String.replace(/^commit:/u, '')(key)})
	return Match.value(key).pipe(
		Match.when('local', () => GitReviewLocalTarget.make({})),
		Match.when('branch', () => GitReviewBranchTarget.make({})),
		Match.orElse(() => GitReviewChangesTarget.make({}))
	)
}
function commitFromRecord(record: string) {
	const parts = pipe(String.split('\u0000')(record), Array.map(String.trim))
	return GitCommit.make({
		checkpoint: String.includes(checkpointCommit.trailer)(parts[3] ?? ''),
		hash: parts[0],
		shortHash: parts[1] ?? '',
		subject: parts[2] ?? ''
	})
}
function publishTitleAndBody(message: string) {
	const lines = String.split(/\r?\n/)(String.trim(message))
	return {body: pipe(Array.drop(lines, 1), Array.join('\n'), String.trim), title: String.trim(lines[0])}
}
function gitHubString(spawner: ChildProcessSpawner.ChildProcessSpawner['Service'], cwd: string) {
	function* runGh(args: readonly string[]) {
		yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd})
		return yield* Effect.scoped(
			Effect.gen(function* () {
				const handle = yield* pipe(
					spawner.spawn(ChildProcess.make('gh', args, {cwd, stderr: 'pipe', stdout: 'pipe'})),
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
		).pipe(Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd}}))
	}
	return Effect.fn('gh.string')(runGh)
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

		const maintenanceProject = Effect.fn('GitWorkspace.maintenanceProject')(function* (cwd: string) {
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

			const maintenanceBranch = Effect.fn('GitWorkspace.maintenanceBranch')(function* (branchLine: string) {
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

			yield* Effect.forEach(branchLines, maintenanceBranch, {discard: true})
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
			listProjectsFrom,
			listRepositoriesFrom,
			listWorktrees,
			maintenance: Effect.fn('GitWorkspace.maintenance')(function* (cwd: string) {
				yield* maintenanceProject(cwd)
				yield* refreshProjects
			}),
			projects,
			refreshProjects
		}
	})
}) {
	public static layer = pipe(Layer.effect(this, this.make), Layer.provide(GitCommand.layer))
}

export class GitChanges extends Context.Service<GitChanges>()('@deslop/git/service/GitChanges', {
	make: Effect.fn('GitChanges.make')(function* (config: {readonly cwd: string}) {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const refs = yield* Ref.make(
			Array.empty<{readonly key: string; readonly ref: SubscriptionRef.SubscriptionRef<GitDiff[]>}>()
		)
		const fileContentCache = yield* Ref.make(HashMap.empty<string, GitDiff>())
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
		const branchBase = Effect.fn('GitChanges.branchBase')(function* (defaultBranch: string) {
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
		const gitDiffs = Effect.fn('GitChanges.gitDiffs')(function* (args: readonly string[]) {
			const patch = yield* git.string(config.cwd, [
				'diff',
				...args,
				...reviewDiffFlags,
				'--patch',
				'--find-renames',
				'--no-ext-diff',
				...patchPathspec()
			])
			return diffsFromPatch(patch)
		})
		const commitDiffs = Effect.fn('GitChanges.commitDiffs')(function* (hash: string) {
			const args = ['--root', '--patch', ...reviewDiffFlags, '--find-renames', '--no-ext-diff']
			const pathspec = patchPathspec()
			const parents = yield* pipe(
				git.string(config.cwd, ['rev-list', '--parents', '-n', '1', hash]),
				Effect.map(flow(String.trim, String.split(/\s+/u)))
			)
			const patch = yield* pipe(
				Array.length(parents) === 3
					? git.string(config.cwd, ['show', '--remerge-diff', '--format=', ...Array.drop(args, 1), hash, ...pathspec])
					: git.string(config.cwd, ['diff-tree', ...args, hash, ...pathspec]),
				Effect.flatMap(output => {
					if (/^diff --git /mu.test(output)) return Effect.succeed(output)
					if (Array.length(parents) === 3) return Effect.succeed(output)
					const parent = parents[1]
					if (Predicate.isUndefined(parent)) return Effect.succeed(output)
					return git.string(config.cwd, ['diff-tree', ...args, parent, hash, ...pathspec])
				})
			)
			return diffsFromPatch(patch)
		})
		const untrackedDiffs = Effect.gen(function* () {
			const files = yield* pipe(
				git.lines(config.cwd, ['ls-files', '--others', '--exclude-standard']),
				Effect.map(Array.filter(filePath => !isReviewExcludedPath(filePath)))
			)
			return yield* Effect.forEach(
				files,
				filePath =>
					pipe(
						fs.readFileString(path.join(config.cwd, filePath)),
						Effect.orElseSucceed(() => ''),
						Effect.map(content => untrackedDiffFromContent(filePath, content))
					),
				{concurrency: 8}
			)
		})
		const fileContent = Effect.fn('GitChanges.fileContent')(function* (input: {
			readonly diff: GitDiff
			readonly target: GitReviewTarget
		}) {
			if (input.diff.status === 'deleted') return
			if (input.target._tag === 'commit') {
				return yield* pipe(
					git.string(config.cwd, ['show', `${input.target.hash}:${input.diff.filePath}`]),
					Effect.orElseSucceed(() => '')
				)
			}
			return yield* pipe(
				fs.readFileString(path.join(config.cwd, input.diff.filePath)),
				Effect.orElseSucceed(() => '')
			)
		})
		const withFileContent = Effect.fn('GitChanges.withFileContent')(function* (input: {
			readonly diffs: readonly GitDiff[]
			readonly target: GitReviewTarget
		}) {
			return yield* Effect.forEach(
				input.diffs,
				diff => {
					const key = `${targetKey(input.target)}\u0000${diff.filePath}\u0000${diff.changeHash}`
					return pipe(
						Ref.get(fileContentCache),
						Effect.flatMap(cache =>
							pipe(
								HashMap.get(cache, key),
								Option.match({
									onNone: () =>
										pipe(
											fileContent({diff, target: input.target}),
											Effect.map(content => GitDiff.make({...diff, fileContent: content})),
											Effect.tap(readyDiff =>
												Ref.update(fileContentCache, current => HashMap.set(current, key, readyDiff))
											)
										),
									onSome: Effect.succeed
								})
							)
						)
					)
				},
				{concurrency: 8}
			)
		})
		const computeDiffs = Effect.fn('GitChanges.computeDiffs')(function* (target: GitReviewTarget) {
			const trackedDiffs = yield* Match.value(target).pipe(
				Match.when({_tag: 'changes'}, () => gitDiffs(['HEAD'])),
				Match.when({_tag: 'commit'}, commit => commitDiffs(commit.hash)),
				Match.when({_tag: 'local'}, () =>
					pipe(
						localBase,
						Effect.flatMap(base => gitDiffs([base]))
					)
				),
				Match.orElse(() =>
					pipe(
						branchDiffBase,
						Effect.flatMap(base => gitDiffs([base]))
					)
				)
			)
			const diffs =
				target._tag === 'changes' && !(yield* hasWorktreeChanges)
					? Array.empty<GitDiff>()
					: Array.appendAll(trackedDiffs, target._tag === 'commit' ? Array.empty<GitDiff>() : yield* untrackedDiffs)
			return yield* withFileContent({diffs, target})
		})
		const commitRecords = Effect.fn('GitChanges.commitRecords')(function* (range: string) {
			const output = yield* git.string(config.cwd, [
				'log',
				'--max-count=80',
				'--format=%H%x00%h%x00%s%x00%B%x1e',
				range
			])
			return pipe(output, String.split('\u001e'), Array.filter(String.isNonEmpty), Array.map(commitFromRecord))
		})
		const commitsBetween = Effect.fn('GitChanges.commitsBetween')(function* (from: string, to: string) {
			return yield* commitRecords(`${from}..${to}`)
		})
		const commits = Effect.fn('GitChanges.commits')(function* (base: string) {
			const from = yield* pipe(
				git.string(config.cwd, ['merge-base', base, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () => Effect.succeed(base))
			)
			return yield* commitsBetween(from, 'HEAD')
		})
		const firstParentCommits = commitRecords('HEAD')
		const pushableCommitCount = Effect.gen(function* () {
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
		const upstreamCounts = Effect.gen(function* () {
			const upstream = yield* pipe(
				git.string(config.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
				Effect.map(String.trim),
				Effect.option
			)
			if (Option.isNone(upstream)) return []
			return yield* pipe(
				git.string(config.cwd, ['rev-list', '--left-right', '--count', `${upstream.value}...HEAD`]),
				Effect.map(output => {
					const counts = pipe(output, String.trim, String.split(/\s+/u))
					return [
						{
							ahead: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0),
							behind: Option.getOrElse(Number.parse(counts[0]), () => 0)
						}
					]
				}),
				Effect.catchTag('GitError', () => Effect.succeed([]))
			)
		})
		const metadataSnapshot = Effect.gen(function* () {
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
				unpushedCommits: (yield* pushableCommitCount) > 0,
				upstream: pipe(yield* upstreamCounts, Array.head, Option.getOrUndefined)
			})
		})
		const metadata = yield* SubscriptionRef.make(yield* metadataSnapshot)
		const worktreeChanges = yield* pipe(
			fs.watch(config.cwd),
			Stream.catch(() => Stream.empty),
			Stream.debounce(Duration.millis(80)),
			Stream.map(() => void 0),
			Stream.share({capacity: 1, idleTimeToLive: Duration.seconds(30), replay: 0, strategy: 'sliding'})
		)
		yield* Effect.forkScoped(
			pipe(
				worktreeChanges,
				Stream.mapEffect(() =>
					pipe(
						metadataSnapshot,
						Effect.flatMap(next => SubscriptionRef.set(metadata, next)),
						Effect.ignore
					)
				),
				Stream.runDrain
			)
		)
		const ensureDiffRef = Effect.fn('GitChanges.ensureDiffRef')(function* (target: GitReviewTarget) {
			const key = targetKey(target)
			const current = yield* Ref.get(refs)
			const existing = Array.findFirst(current, entry => entry.key === key)
			if (Option.isSome(existing)) return existing.value.ref
			const ref = yield* SubscriptionRef.make(yield* computeDiffs(target))
			yield* Ref.update(refs, currentRefs => Array.append(currentRefs, {key, ref}))
			return ref
		})
		yield* Effect.forkScoped(
			pipe(
				worktreeChanges,
				Stream.mapEffect(() =>
					pipe(
						Ref.get(refs),
						Effect.flatMap(currentRefs =>
							Effect.forEach(
								currentRefs,
								entry => {
									const target = targetFromKey(entry.key)
									if (target._tag === 'commit') return Effect.void
									return pipe(
										computeDiffs(target),
										Effect.flatMap(next =>
											SubscriptionRef.update(entry.ref, currentDiffs =>
												sameDiffs(currentDiffs, next) ? currentDiffs : next
											)
										),
										Effect.ignore
									)
								},
								{concurrency: 2, discard: true}
							)
						)
					)
				),
				Stream.runDrain
			)
		)
		yield* Effect.forkScoped(pipe(ensureDiffRef(GitReviewChangesTarget.make({})), Effect.ignore))
		return {diffs: ensureDiffRef, metadata}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const state = yield* SubscriptionRef.make(GitReviewState.make({comments: [], marks: []}))
		const suppressedThreadIds = yield* Ref.make(HashSet.empty<string>())
		const ghString = gitHubString(spawner, config.cwd)
		const prReviewComments = Effect.gen(function* () {
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
			const query = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes { id isResolved diffSide comments(first: 20) { nodes { body line originalLine path url } } } } } } }`
			const response = yield* pipe(
				ghString([
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
				]),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubReviewThreadsResponse))),
				Effect.mapError(cause => new GitError({cause, message: 'Failed to parse GitHub review threads.'}))
			)
			const suppressed = yield* Ref.get(suppressedThreadIds)
			const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
			return pipe(
				threads,
				Array.filter(thread => thread.isResolved === false && !HashSet.has(suppressed, thread.id)),
				Array.flatMap(thread =>
					Array.map(thread.comments.nodes, comment =>
						GitReviewComment.make({
							body: comment.body,
							filePath: comment.path,
							lineNumber: comment.line ?? comment.originalLine ?? 1,
							side: thread.diffSide === 'LEFT' ? 'deletions' : 'additions',
							source: 'github',
							threadId: thread.id,
							url: comment.url
						})
					)
				),
				Array.filter(comment => !isReviewExcludedPath(comment.filePath))
			)
		})
		yield* Effect.forkScoped(
			pipe(
				prReviewComments,
				Effect.catchTag('GitError', () => Effect.succeed(Array.empty<GitReviewComment>())),
				Effect.flatMap(comments =>
					SubscriptionRef.update(state, current =>
						GitReviewState.make({
							comments: Array.appendAll(
								Array.filter(current.comments, comment => comment.source !== 'github'),
								comments
							),
							marks: current.marks
						})
					)
				)
			)
		)
		return {
			mark: (marks: readonly GitReviewMark[]) =>
				SubscriptionRef.update(state, current => gitReviewStateMark(current, marks)),
			resolveComments: Effect.fn('GitReview.resolveComments')(function* (comments: readonly GitReviewComment[]) {
				yield* SubscriptionRef.update(state, current => gitReviewStateDeleteComments(current, comments))
				const threadIds = pipe(
					comments,
					Array.filter(comment => comment.source === 'github' && Predicate.isString(comment.threadId)),
					Array.map(comment => comment.threadId ?? ''),
					Array.filter(String.isNonEmpty),
					Array.dedupe
				)
				if (Array.isReadonlyArrayEmpty(threadIds)) return
				yield* Ref.update(suppressedThreadIds, current => HashSet.union(current, HashSet.fromIterable(threadIds)))
				const query = `mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { id } } }`
				const failures = yield* pipe(
					threadIds,
					Effect.forEach(
						threadId =>
							pipe(
								ghString(['api', 'graphql', '-f', `query=${query}`, '-f', `threadId=${threadId}`]),
								Effect.as(Array.empty<GitError>()),
								Effect.catchTag('GitError', error => Effect.succeed([error]))
							),
						{concurrency: 4}
					),
					Effect.map(Array.flatten)
				)
				if (!Array.isReadonlyArrayEmpty(failures)) {
					return yield* new GitError({
						message: 'Comments were hidden locally, but one or more GitHub threads failed to resolve.'
					})
				}
			}),
			saveComment: Effect.fn('GitReview.saveComment')(function* (comment: GitReviewCommentDraft) {
				if (isReviewExcludedPath(comment.filePath)) return
				yield* SubscriptionRef.update(state, current => gitReviewStateSaveComment(current, comment))
			}),
			state,
			unmark: (marks: readonly GitReviewMark[]) =>
				SubscriptionRef.update(state, current => gitReviewStateUnmark(current, marks))
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}

export class GitPublish extends Context.Service<GitPublish>()('@deslop/git/service/GitPublish', {
	make: Effect.fn('GitPublish.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand
		const ghString = gitHubString(spawner, config.cwd)
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
		const pullRequest = yield* SubscriptionRef.make(yield* currentPullRequest)
		const pushableCommitCount = Effect.gen(function* () {
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
		const headCheckpointCommits = Effect.gen(function* () {
			const output = yield* pipe(
				git.string(config.cwd, ['log', '--format=%H%x00%h%x00%s%x00%B%x1e', 'HEAD']),
				Effect.catchTag('GitError', () => Effect.succeed(''))
			)
			const commits = pipe(output, String.split('\u001e'), Array.filter(String.isNonEmpty), Array.map(commitFromRecord))
			return Array.takeWhile(commits, commit => commit.checkpoint)
		})
		const commitAll = Effect.fn('GitPublish.commitAll')(function* (message: string) {
			yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
			yield* pipe(git.stringWithInput(config.cwd, ['commit', '-F', '-'], message), Effect.asVoid)
		})
		const push = Effect.gen(function* () {
			if (!(yield* hasPushableCommits)) return
			const branch = yield* currentBranch
			yield* pipe(git.string(config.cwd, ['push', '-u', 'origin', `HEAD:${branch}`]), Effect.asVoid)
			if (yield* hasPushableCommits) {
				return yield* new GitError({message: 'Push completed but the branch still has unpushed commits.'})
			}
		})
		const upsertDraftPullRequest = Effect.fn('GitPublish.upsertDraftPullRequest')(function* (message: string) {
			const branch = yield* currentBranch
			const defaultBranch = yield* defaultBranchName
			if (branch === defaultBranch) return Array.head(emptyGitPullRequests)
			const titleBody = publishTitleAndBody(message)
			if (String.isEmpty(titleBody.title)) return yield* new GitError({message: 'Publish message title required.'})
			const existing = yield* currentPullRequest
			if (Option.isSome(existing)) {
				yield* pipe(ghString(['pr', 'edit', '--title', titleBody.title, '--body', titleBody.body]), Effect.asVoid)
				return existing
			}
			const output = yield* ghString(['pr', 'create', '--draft', '--title', titleBody.title, '--body', titleBody.body])
			const url = output.match(/https?:\/\/\S+/u)?.[0] ?? String.trim(output)
			return Array.head(String.isNonEmpty(url) ? [GitPullRequest.make({url})] : [])
		})
		return {
			checkpoint: Effect.gen(function* () {
				if (!(yield* hasWorktreeChanges)) return yield* new GitError({message: 'No changes to checkpoint.'})
				yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
				yield* pipe(
					git.stringWithInput(config.cwd, ['commit', '-F', '-'], `checkpoint\n\n${checkpointCommit.trailer}\n`),
					Effect.asVoid
				)
			}),
			publish: Effect.fn('GitPublish.publish')(function* (input: {readonly message: string}) {
				const message = String.trim(input.message)
				if (String.isEmpty(message)) return yield* new GitError({message: 'Publish message required.'})
				const checkpoints = yield* headCheckpointCommits
				const dirty = yield* hasWorktreeChanges
				const committed = yield* Effect.gen(function* () {
					if (Array.isReadonlyArrayEmpty(checkpoints)) {
						if (!dirty) return false
						yield* commitAll(message)
						return true
					}
					const oldest = pipe(checkpoints, Array.last, Option.getOrUndefined)
					if (Predicate.isUndefined(oldest)) return yield* new GitError({message: 'Checkpoint state is invalid.'})
					const backupRef = `refs/deslop/backups/${Date.now()}-${randomUUID()}`
					yield* pipe(git.string(config.cwd, ['update-ref', backupRef, 'HEAD']), Effect.asVoid)
					yield* pipe(git.string(config.cwd, ['reset', '--soft', `${oldest.hash}^`]), Effect.asVoid)
					yield* commitAll(message)
					return true
				})
				const pushed = yield* pipe(
					hasPushableCommits,
					Effect.flatMap(shouldPush => (shouldPush ? pipe(push, Effect.as(true)) : Effect.succeed(false)))
				)
				const pr = yield* pipe(
					upsertDraftPullRequest(message),
					Effect.catchTag(
						'GitError',
						error =>
							new GitError({
								cause: error,
								message: `${committed ? 'Changes were committed. ' : ''}${pushed ? 'Changes were pushed. ' : ''}PR update failed: ${error.message}`
							})
					)
				)
				if (!committed && !pushed && Option.isNone(pr)) {
					return yield* new GitError({message: 'No changes, unpushed commits, or pull request to publish.'})
				}
				yield* SubscriptionRef.set(pullRequest, pr)
				return Option.getOrUndefined(pr)
			}),
			pullRequest
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}
