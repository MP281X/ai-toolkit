import {createHash, randomUUID} from 'node:crypto'
import {homedir} from 'node:os'

import {
	Array,
	Clock,
	Config,
	Context,
	Duration,
	Effect,
	FileSystem,
	Function,
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
	Semaphore,
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
	GitProject,
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewComment,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	GitReviewMetadata,
	GitReviewState,
	GitRepository,
	type GitReviewCommentDraft,
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

		const string = Effect.fn('GitCommand.string')(function* (cwd: string, args: string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'git', cwd})
			return yield* pipe(
				Effect.scoped(
					Effect.gen(function* () {
						const handle = yield* pipe(
							spawner.spawn(ChildProcess.make('git', args, {cwd, stderr: 'pipe', stdout: 'pipe'})),
							Effect.mapError(cause => GitError.make({cause}))
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
							Effect.mapError(cause => GitError.make({cause}))
						)

						if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
							return yield* GitError.make({
								cause: output.stderr || output.stdout || `git ${Array.join(' ')(args)} exited with ${exitCode}`
							})
						}

						return output.stdout
					})
				),
				Effect.withSpan('git.command', {attributes: {command: args[0] ?? 'git', cwd}})
			)
		})

		const stringWithInput = Effect.fn('GitCommand.stringWithInput')(function* (
			cwd: string,
			args: string[],
			input: string
		) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'git', cwd})
			return yield* pipe(
				Effect.scoped(
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
							Effect.mapError(cause => GitError.make({cause}))
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
							Effect.mapError(cause => GitError.make({cause}))
						)

						if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
							return yield* GitError.make({
								cause: output.stderr || output.stdout || `git ${Array.join(' ')(args)} exited with ${exitCode}`
							})
						}

						return output.stdout
					})
				),
				Effect.withSpan('git.command', {attributes: {command: args[0] ?? 'git', cwd}})
			)
		})

		return {
			lines: Effect.fn('GitCommand.lines')(function* (cwd: string, args: string[]) {
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

type DiscoveredWorktree = {branch?: string; gitDirectory: string; main: boolean; root: string}

function discoveredWorktree(input: {
	branch?: string
	gitDirectory: string
	main: boolean
	root: string
}): DiscoveredWorktree {
	return {branch: input.branch, gitDirectory: input.gitDirectory, main: input.main, root: input.root}
}

type GitHubRepositoryResponse = typeof GitHubRepositoryResponse.Type
const GitHubRepositoryResponse = Schema.Struct({name: Schema.String, owner: Schema.Struct({login: Schema.String})})

type GitHubReviewThreadCommentResponse = typeof GitHubReviewThreadCommentResponse.Type
const GitHubReviewThreadCommentResponse = Schema.Struct({
	body: Schema.String,
	line: Schema.OptionFromOptionalNullOr(Schema.Finite, {onNoneEncoding: 'omit'}),
	originalLine: Schema.OptionFromOptionalNullOr(Schema.Finite, {onNoneEncoding: 'omit'}),
	path: Schema.String,
	url: Schema.optional(Schema.String)
})

type GitHubReviewThreadResponse = typeof GitHubReviewThreadResponse.Type
const GitHubReviewThreadResponse = Schema.Struct({
	comments: Schema.Struct({nodes: Schema.Array(GitHubReviewThreadCommentResponse)}),
	diffSide: Schema.optional(Schema.String),
	id: Schema.String,
	isResolved: Schema.Boolean
})

type GitHubPullRequestResponse = typeof GitHubPullRequestResponse.Type
const GitHubPullRequestResponse = Schema.Struct({
	reviewThreads: Schema.optional(Schema.Struct({nodes: Schema.Array(GitHubReviewThreadResponse)}))
})

type GitHubReviewRepositoryResponse = typeof GitHubReviewRepositoryResponse.Type
const GitHubReviewRepositoryResponse = Schema.Struct({pullRequest: Schema.optional(GitHubPullRequestResponse)})

type GitHubReviewThreadsResponse = typeof GitHubReviewThreadsResponse.Type
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
function repositorySlug(realRoot: string) {
	const hash = pipe(createHash('sha256').update(realRoot).digest('hex'), String.slice(0, 10))
	return `${pathSlug(Option.getOrElse(Array.last(String.split('/')(realRoot)), () => realRoot))}-${hash}`
}
function branchSlug(branch: string) {
	return pathSlug(branch)
}
function firstWorktreeRoot(worktrees: {root: string}[], fallback: string) {
	return pipe(
		Array.head(worktrees),
		Option.map(worktree => worktree.root),
		Option.getOrElse(() => fallback)
	)
}
function validWorkbenchBranch(branch: string) {
	return /^(feat|fix|refactor|perf|test|docs|chore)\/[a-z0-9-]+$/u.test(branch)
}
function sameProjectSnapshot(left: GitProject[], right: GitProject[]) {
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
	fields: string[],
	current: {branch: string; hasHead: boolean; root: string},
	records: {branch: string; hasHead: boolean; root: string}[]
): {branch: string; hasHead: boolean; root: string}[] {
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
	const basename = pipe(
		parts,
		Array.last,
		Option.getOrElse(() => filePath)
	)
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
function watchPathParts(path: string) {
	const normalized = String.replace(/\\/gu, '/')(path)
	return {normalized, parts: String.split('/')(normalized)}
}
function metadataWatchPath(path: string) {
	const watchPath = watchPathParts(path)
	return !Array.some(watchPath.parts, part => part !== '.git' && HashSet.has(excludedDiscoveryEntries, part))
}
function reviewWatchPath(path: string) {
	const watchPath = watchPathParts(path)
	if (Array.some(watchPath.parts, part => part === '.git' || HashSet.has(excludedDiscoveryEntries, part))) return false
	return !isReviewExcludedPath(watchPath.normalized)
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
		(deleted ? firstMatch(chunk, /^--- a\/(.+)$/mu) : undefined) ??
		firstMatch(chunk, /^\+\+\+ b\/(.+)$/mu) ??
		firstMatch(chunk, /^--- a\/(.+)$/mu) ??
		firstMatch(chunk, /^diff --git a\/.+ b\/(.+)$/mu) ??
		''
	const status = pipe(
		Match.value(chunk),
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
function firstMatch(value: string, expression: RegExp) {
	return pipe(value, String.match(expression), Option.flatMap(Array.get(1)), Option.getOrUndefined)
}
function diffsFromPatch(patch: string) {
	return pipe(
		String.split(/(?=^diff --git )/mu)(patch),
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
function targetKey(target: GitReviewTarget) {
	return target._tag === 'commit' ? `commit:${target.hash}` : target._tag
}
function targetFromKey(key: string) {
	if (String.startsWith('commit:')(key)) return GitReviewCommitTarget.make({hash: String.replace(/^commit:/u, '')(key)})
	return pipe(
		Match.value(key),
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
function commitsFromRecords(output: string) {
	return pipe(
		output,
		String.split('\u001e'),
		Array.map(String.trim),
		Array.filter(String.isNonEmpty),
		Array.map(commitFromRecord),
		Array.filter(commit => String.isNonEmpty(commit.hash))
	)
}
function porcelainBranchStatus(lines: string[]) {
	function header(name: string) {
		return pipe(
			lines,
			Array.findFirst(line => String.startsWith(`${name} `)(line)),
			Option.map(line => String.trim(String.slice(String.length(name) + 1)(line))),
			Option.getOrUndefined
		)
	}

	const counts = /^\+([0-9]+) -([0-9]+)$/u.exec(header('# branch.ab') ?? '')
	return {
		ahead: pipe(
			counts?.[1] ?? '0',
			Number.parse,
			Option.getOrElse(() => 0)
		),
		behind: pipe(
			counts?.[2] ?? '0',
			Number.parse,
			Option.getOrElse(() => 0)
		),
		branch: header('# branch.head') ?? '',
		dirty: Array.some(lines, line => !String.startsWith('#')(line)),
		upstream: header('# branch.upstream')
	}
}
function gitHubString(spawner: ChildProcessSpawner.ChildProcessSpawner['Service'], cwd: string) {
	function* runGh(args: string[]) {
		yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd})
		return yield* pipe(
			Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('gh', args, {cwd, stderr: 'pipe', stdout: 'pipe'})),
						Effect.mapError(cause => GitError.make({cause}))
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
						Effect.mapError(cause => GitError.make({cause}))
					)
					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* GitError.make({
							cause: output.stderr || output.stdout || `gh ${Array.join(' ')(args)} exited with ${exitCode}`
						})
					}
					return output.stdout
				})
			),
			Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd}})
		)
	}
	return Effect.fn('gh.string')(runGh)
}

export class GitWorkspace extends Context.Service<GitWorkspace>()('@deslop/git/service/GitWorkspace', {
	make: Effect.gen(function* () {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const readDirectoryEntries = Effect.fnUntraced(function* (directory: string) {
			const names = yield* pipe(
				fs.readDirectory(directory),
				Effect.orElseSucceed(() => Array.empty<string>())
			)
			return yield* pipe(
				names,
				Effect.forEach(
					name =>
						pipe(
							fs.stat(path.join(directory, name)),
							Effect.map(info => ({name, type: info.type})),
							Effect.option
						),
					{concurrency: 16}
				),
				Effect.map(Array.getSomes)
			)
		})
		const readTextFile = Effect.fnUntraced(function* (filePath: string) {
			return yield* pipe(
				fs.readFileString(filePath),
				Effect.orElseSucceed(() => '')
			)
		})
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(homedir()))
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())
		const projectRefreshLock = yield* Semaphore.make(1)

		const worktreeClean = Effect.fn('GitWorkspace.worktreeClean')(function* (cwd: string) {
			return yield* pipe(git.lines(cwd, ['status', '--porcelain']), Effect.map(Array.isReadonlyArrayEmpty))
		})

		const maintenanceProject = Effect.fn('GitWorkspace.maintenanceProject')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})

			const root = yield* pipe(
				fs.realPath(cwd),
				Effect.mapError(cause => GitError.make({cause}))
			)
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
					? yield* pipe(
							fs.realPath(worktreePath),
							Effect.orElseSucceed(() => worktreePath)
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

		const repositoryProbeOutput = Effect.fnUntraced(function* (searchRoots: string[]) {
			const args = ['--hidden', '--files', ...Array.flatMap(repositoryProbeGlobs, glob => ['-g', glob]), ...searchRoots]
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(ChildProcess.make('rg', args, {stderr: 'pipe', stdout: 'pipe'})),
						Effect.mapError(cause => GitError.make({cause}))
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
						Effect.mapError(cause => GitError.make({cause}))
					)

					if (
						exitCode === ChildProcessSpawner.ExitCode(0) ||
						exitCode === ChildProcessSpawner.ExitCode(1) ||
						(exitCode === ChildProcessSpawner.ExitCode(2) && repositoryProbeOnlyPermissionErrors(output.stderr))
					) {
						return output.stdout
					}

					return yield* GitError.make({
						cause: output.stderr || output.stdout || `rg ${Array.join(' ')(args)} exited with ${exitCode}`
					})
				})
			)
		})
		const directRepositoryRoot = Effect.fnUntraced(function* (root: string) {
			const exists = yield* pipe(
				fs.exists(path.join(root, '.git')),
				Effect.mapError(cause => GitError.make({cause}))
			)
			return exists ? Option.some(normalizePublicPath(root)) : Option.none()
		})
		const repositorySearchRoots = Effect.fn('GitWorkspace.repositorySearchRoots')(function* (root: string) {
			if (root !== home) return [root]

			return pipe(
				yield* readDirectoryEntries(root),
				Array.filter(entry => entry.type === 'Directory'),
				Array.map(entry => entry.name),
				Array.filter(entry => !HashSet.has(excludedHomeDiscoveryEntries, entry)),
				Array.filter(entry => !HashSet.has(excludedDiscoveryEntries, entry)),
				Array.filter(entry => !String.startsWith('.')(entry)),
				Array.map(entry => path.join(root, entry))
			)
		})
		const linkedWorktrees = Effect.fnUntraced(function* (gitDirectory: string) {
			const worktreesDirectory = path.join(gitDirectory, 'worktrees')
			return yield* pipe(
				yield* readDirectoryEntries(worktreesDirectory),
				Array.filter(entry => entry.type === 'Directory'),
				Effect.forEach(entry =>
					Effect.gen(function* () {
						const metadataDirectory = path.join(worktreesDirectory, entry.name)
						const gitdir = String.trim(yield* readTextFile(path.join(metadataDirectory, 'gitdir')))
						if (String.isEmpty(gitdir)) return Option.none<DiscoveredWorktree>()

						const branch = firstMatch(
							String.trim(yield* readTextFile(path.join(metadataDirectory, 'HEAD'))),
							/^ref: refs\/heads\/(.+)$/u
						)
						return Option.some(
							discoveredWorktree({
								branch,
								gitDirectory,
								main: false,
								root: normalizePublicPath(path.dirname(path.resolve(metadataDirectory, gitdir)))
							})
						)
					})
				),
				Effect.map(Array.getSomes)
			)
		})
		const worktreeFromRoot = Effect.fnUntraced(function* (root: string, entries: {name: string; type: string}[]) {
			const dotGit = Array.findFirst(entries, entry => entry.name === '.git')
			if (Option.isNone(dotGit)) return

			const dotGitPath = path.join(root, '.git')
			if (dotGit.value.type === 'Directory') {
				const gitDirectory = normalizePublicPath(dotGitPath)
				const branch = firstMatch(
					String.trim(yield* readTextFile(path.join(gitDirectory, 'HEAD'))),
					/^ref: refs\/heads\/(.+)$/u
				)
				return discoveredWorktree({branch, gitDirectory, main: true, root: normalizePublicPath(root)})
			}
			if (dotGit.value.type !== 'File') return

			const gitDirectoryValue = firstMatch(yield* readTextFile(dotGitPath), /^gitdir:\s*(.+)$/mu)
			if (Predicate.isUndefined(gitDirectoryValue)) return

			const gitDirectory = normalizePublicPath(path.resolve(root, String.trim(gitDirectoryValue)))
			const commonDirectoryValue = String.trim(yield* readTextFile(path.join(gitDirectory, 'commondir')))
			const commonDirectory = String.isEmpty(commonDirectoryValue)
				? gitDirectory
				: normalizePublicPath(path.resolve(gitDirectory, commonDirectoryValue))
			const branch = firstMatch(
				String.trim(yield* readTextFile(path.join(gitDirectory, 'HEAD'))),
				/^ref: refs\/heads\/(.+)$/u
			)

			return discoveredWorktree({branch, gitDirectory: commonDirectory, main: false, root: normalizePublicPath(root)})
		})
		const discoverWorktreesFrom = Effect.fn('GitWorkspace.discoverWorktreesFrom')(function* (root: string) {
			const directEntries = yield* readDirectoryEntries(root)
			const directWorktree = yield* worktreeFromRoot(root, directEntries)
			if (Predicate.isNotUndefined(directWorktree)) return [directWorktree]

			function search(
				pending: string[],
				worktrees: DiscoveredWorktree[]
			): Effect.Effect<DiscoveredWorktree[], GitError> {
				if (Array.isReadonlyArrayEmpty(pending)) return Effect.succeed(worktrees)

				const directory = pipe(pending, Array.last, Option.getOrThrow)
				const remaining = Array.dropRight(pending, 1)

				return Effect.gen(function* () {
					const entries = yield* readDirectoryEntries(directory)
					const worktree = yield* worktreeFromRoot(directory, entries)
					if (Predicate.isNotUndefined(worktree)) {
						const discovered = Array.append(worktrees, worktree)
						const next = worktree.main
							? Array.appendAll(discovered, yield* linkedWorktrees(worktree.gitDirectory))
							: discovered
						return yield* Effect.suspend(() => search(remaining, next))
					}

					const children = pipe(
						entries,
						Array.filter(
							entry =>
								entry.type === 'Directory' &&
								!String.startsWith('.')(entry.name) &&
								!HashSet.has(excludedDiscoveryEntries, entry.name)
						),
						Array.map(entry => path.join(directory, entry.name))
					)
					return yield* Effect.suspend(() => search(Array.appendAll(remaining, children), worktrees))
				})
			}

			const worktrees = yield* search(yield* repositorySearchRoots(root), Array.empty())

			return pipe(
				worktrees,
				Array.dedupeWith((left, right) => left.root === right.root),
				Array.sortWith(worktree => worktree.root, Order.String)
			)
		})
		const projectsFromWorktrees = Effect.fnUntraced(function* (worktrees: DiscoveredWorktree[]) {
			const groups = pipe(
				worktrees,
				Array.reduce(HashMap.empty<string, DiscoveredWorktree[]>(), (current, worktree) =>
					HashMap.set(
						current,
						worktree.gitDirectory,
						pipe(
							HashMap.get(current, worktree.gitDirectory),
							Option.getOrElse(() => Array.empty<DiscoveredWorktree>()),
							Array.append(worktree)
						)
					)
				)
			)

			return pipe(
				Array.fromIterable(groups),
				Array.map(group => {
					const gitDirectory = group[0]
					const sortedWorktrees = Array.sortWith(
						group[1],
						worktree => `${worktree.main ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
						Order.String
					)
					const root = firstWorktreeRoot(sortedWorktrees, gitDirectory)

					return GitProject.make({
						repository: GitRepository.make({gitDirectory, root}),
						worktrees: Array.map(sortedWorktrees, worktree =>
							GitWorktree.make({branch: worktree.branch, root: worktree.root})
						)
					})
				}),
				Array.sortWith(project => project.repository.root, Order.String)
			)
		})
		const nativeProjectsFrom = Effect.fn('GitWorkspace.nativeProjectsFrom')(function* (root: string) {
			return yield* pipe(discoverWorktreesFrom(root), Effect.flatMap(projectsFromWorktrees))
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
					{concurrency: 1}
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
						root: normalizePublicPath(worktree.root),
						...(String.isNonEmpty(worktree.branch) ? {branch: worktree.branch} : {})
					})
				)
			)
		})

		const listRepositoriesFrom = Effect.fn('GitWorkspace.listRepositoriesFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				repositoryRootsFromProbe(cwd),
				Effect.flatMap(Effect.forEach(root => Effect.option(repositoryFromRoot(root)), {concurrency: 1})),
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
			if (cwd === home) return yield* nativeProjectsFrom(cwd)
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
							{concurrency: 1}
						)
					)
				),
				Array.getSomes,
				Array.sortWith(project => project.repository.root, Order.String)
			)
		})
		const refreshProjects = pipe(
			Effect.gen(function* () {
				yield* Effect.annotateCurrentSpan({cwd: home})
				const next = yield* listProjectsFrom(home)
				const current = yield* SubscriptionRef.get(projects)
				if (!sameProjectSnapshot(current, next)) yield* SubscriptionRef.set(projects, next)
			}),
			Semaphore.withPermit(projectRefreshLock)
		)
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
				branch: string
				cwd: string
				source: GitWorktreeSource
			}) {
				yield* Effect.annotateCurrentSpan({branch: input.branch, cwd: input.cwd})
				if (input.source._tag === 'new' && !validWorkbenchBranch(input.branch)) {
					return yield* GitError.make({
						message:
							'New worktree branches must start with feat/, fix/, refactor/, perf/, test/, docs/, or chore/ and use lowercase letters, digits, and hyphens after the prefix.'
					})
				}
				const repositoryRoot = yield* pipe(
					fs.realPath(input.cwd),
					Effect.mapError(cause => GitError.make({cause}))
				)
				const targetDirectory = path.join(
					home,
					'.deslop',
					'worktrees',
					repositorySlug(repositoryRoot),
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

				yield* pipe(
					Match.value(input.source),
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
			deleteWorktree: Effect.fn('GitWorkspace.deleteWorktree')(function* (input: {cwd: string}) {
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
	make: Effect.fn('GitChanges.make')(function* (config: {cwd: string}) {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const refs = yield* Ref.make(Array.empty<{key: string; ref: SubscriptionRef.SubscriptionRef<GitDiff[]>}>())
		const diffRefLock = yield* Semaphore.make(1)
		const metadataRefreshLock = yield* Semaphore.make(1)
		const fileContentCache = yield* Ref.make(HashMap.empty<string, GitDiff>())
		const defaultBranchName = yield* Effect.cached(
			pipe(
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
		)
		const statusSnapshot = Effect.gen(function* () {
			return porcelainBranchStatus(
				yield* git.lines(config.cwd, [
					'--no-optional-locks',
					'status',
					'--porcelain=v2',
					'--branch',
					'--untracked-files=normal'
				])
			)
		})
		const branchDiffBase = Effect.gen(function* () {
			const defaultBranch = yield* defaultBranchName
			const remoteBase = `origin/${defaultBranch}`
			return yield* pipe(
				git.string(config.cwd, ['merge-base', remoteBase, 'HEAD']),
				Effect.map(String.trim),
				Effect.catchTag('GitError', () =>
					pipe(
						git.string(config.cwd, ['merge-base', defaultBranch, 'HEAD']),
						Effect.map(String.trim),
						Effect.catchTag('GitError', () => Effect.succeed(defaultBranch))
					)
				)
			)
		})
		const localBase = Effect.gen(function* () {
			const status = yield* statusSnapshot
			return status.upstream ?? (yield* branchDiffBase)
		})
		const gitDiffs = Effect.fn('GitChanges.gitDiffs')(function* (args: string[]) {
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
			diff: GitDiff
			target: GitReviewTarget
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
			diffs: GitDiff[]
			target: GitReviewTarget
		}) {
			return yield* Effect.forEach(
				input.diffs,
				diff => {
					if (input.target._tag !== 'commit') {
						return pipe(
							fileContent({diff, target: input.target}),
							Effect.map(content => GitDiff.make({...diff, fileContent: content}))
						)
					}
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
			const trackedDiffs = yield* pipe(
				Match.value(target),
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
			const diffs = Array.appendAll(
				trackedDiffs,
				target._tag === 'commit' ? Array.empty<GitDiff>() : yield* untrackedDiffs
			)
			return yield* withFileContent({diffs, target})
		})
		const commitRecords = Effect.fn('GitChanges.commitRecords')(function* (range: string) {
			const output = yield* git.string(config.cwd, [
				'log',
				'--max-count=80',
				'--format=%H%x00%h%x00%s%x00%B%x1e',
				range
			])
			return commitsFromRecords(output)
		})
		const firstParentCommits = Effect.gen(function* () {
			const output = yield* git.string(config.cwd, [
				'log',
				'--first-parent',
				'--max-count=80',
				'--format=%H%x00%h%x00%s%x00%B%x1e',
				'HEAD'
			])
			return commitsFromRecords(output)
		})
		const commitsBetween = Effect.fn('GitChanges.commitsBetween')(function* (from: string, to: string) {
			return yield* commitRecords(`${from}..${to}`)
		})
		const metadataSnapshot = Effect.gen(function* () {
			const status = yield* statusSnapshot
			const defaultBranch = yield* defaultBranchName
			const branchBaseRef = yield* branchDiffBase
			const localBaseRef = status.upstream ?? branchBaseRef
			const localCommits = yield* commitsBetween(localBaseRef, 'HEAD')
			const nonDefaultBranchCommits =
				localBaseRef === branchBaseRef ? Effect.succeed(localCommits) : commitsBetween(branchBaseRef, 'HEAD')
			const branchCommitCandidates =
				status.branch === defaultBranch ? yield* firstParentCommits : yield* nonDefaultBranchCommits
			const localCommitHashes = pipe(
				localCommits,
				Array.map(commit => commit.hash),
				HashSet.fromIterable
			)
			const branchCommits = Array.filter(branchCommitCandidates, commit => !HashSet.has(localCommitHashes, commit.hash))
			return GitReviewMetadata.make({
				branchCommits,
				dirty: status.dirty,
				localCommits,
				unpushedCommits: Predicate.isString(status.upstream)
					? status.ahead > 0
					: !Array.isReadonlyArrayEmpty(localCommits),
				upstream: Predicate.isString(status.upstream) ? {ahead: status.ahead, behind: status.behind} : undefined
			})
		})
		const metadata = yield* SubscriptionRef.make(
			GitReviewMetadata.make({branchCommits: [], dirty: false, localCommits: [], unpushedCommits: false})
		)
		const refreshMetadata = pipe(
			metadataSnapshot,
			Effect.flatMap(next => SubscriptionRef.set(metadata, next)),
			Semaphore.withPermit(metadataRefreshLock)
		)
		const worktreeEvents = yield* pipe(
			fs.watch(config.cwd),
			Stream.catch(() => Stream.empty),
			Stream.share({capacity: 1, idleTimeToLive: Duration.seconds(30), replay: 0, strategy: 'sliding'})
		)
		yield* Effect.forkScoped(
			pipe(
				worktreeEvents,
				Stream.filter(event => metadataWatchPath(event.path)),
				Stream.debounce(Duration.millis(80)),
				Stream.mapEffect(() => pipe(refreshMetadata, Effect.ignore)),
				Stream.runDrain
			)
		)
		yield* Effect.forkScoped(pipe(refreshMetadata, Effect.ignore))
		const ensureDiffRef = Effect.fn('GitChanges.ensureDiffRef')(function* (target: GitReviewTarget) {
			return yield* pipe(
				Effect.gen(function* () {
					const key = targetKey(target)
					const current = yield* Ref.get(refs)
					const existing = Array.findFirst(current, entry => entry.key === key)
					if (Option.isSome(existing)) return existing.value.ref
					const ref = yield* SubscriptionRef.make(yield* computeDiffs(target))
					yield* Ref.update(refs, currentRefs => Array.append(currentRefs, {key, ref}))
					return ref
				}),
				Semaphore.withPermit(diffRefLock)
			)
		})
		yield* Effect.forkScoped(
			pipe(
				worktreeEvents,
				Stream.filter(event => reviewWatchPath(event.path)),
				Stream.debounce(Duration.millis(80)),
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
										Effect.flatMap(next => SubscriptionRef.set(entry.ref, next)),
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
		return {
			diffs: flow(
				ensureDiffRef,
				Effect.map(ref => pipe(SubscriptionRef.changes(ref), Stream.changes))
			),
			metadata: pipe(SubscriptionRef.changes(metadata), Stream.changes)
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const state = yield* SubscriptionRef.make(GitReviewState.make({comments: [], marks: []}))
		const suppressedThreadIds = yield* Ref.make(HashSet.empty<string>())
		const ghString = gitHubString(spawner, config.cwd)
		const prReviewComments = Effect.gen(function* () {
			const pr = yield* pipe(
				ghString(['pr', 'view', '--json', 'number', '--jq', '.number']),
				Effect.map(flow(String.trim, Number.parse)),
				Effect.flatMap(Option.match({onNone: () => GitError.make({message: 'No PR found.'}), onSome: Effect.succeed}))
			)
			const repository = yield* pipe(
				ghString(['repo', 'view', '--json', 'owner,name']),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubRepositoryResponse))),
				Effect.mapError(cause => GitError.make({cause, message: 'Failed to parse GitHub repository.'}))
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
				Effect.mapError(cause => GitError.make({cause, message: 'Failed to parse GitHub review threads.'}))
			)
			const suppressed = yield* Ref.get(suppressedThreadIds)
			const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
			return pipe(
				threads,
				Array.filter(thread => !thread.isResolved && !HashSet.has(suppressed, thread.id)),
				Array.flatMap(thread =>
					Array.map(thread.comments.nodes, comment =>
						GitReviewComment.make({
							body: comment.body,
							filePath: comment.path,
							lineNumber: pipe(
								comment.line,
								Option.orElse(() => comment.originalLine),
								Option.getOrElse(() => 1)
							),
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
		const refreshGitHubComments = pipe(
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
		yield* Effect.forkScoped(pipe(refreshGitHubComments, Effect.ignore))
		return {
			mark: (marks: GitReviewState['marks']) =>
				SubscriptionRef.update(state, current => gitReviewStateMark(current, marks)),
			resolveComments: Effect.fn('GitReview.resolveComments')(function* (comments: GitReviewState['comments']) {
				const threadIds = pipe(
					comments,
					Array.filter(comment => comment.source === 'github' && Predicate.isString(comment.threadId)),
					Array.map(comment => comment.threadId ?? ''),
					Array.filter(String.isNonEmpty),
					Array.dedupe
				)
				if (Array.isReadonlyArrayEmpty(threadIds)) {
					yield* SubscriptionRef.update(state, current => gitReviewStateDeleteComments(current, comments))
					return
				}
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
					return yield* GitError.make({message: 'One or more GitHub threads failed to resolve.'})
				}
				yield* Ref.update(suppressedThreadIds, current => HashSet.union(current, HashSet.fromIterable(threadIds)))
				yield* SubscriptionRef.update(state, current => gitReviewStateDeleteComments(current, comments))
			}),
			saveComment: Effect.fn('GitReview.saveComment')(function* (comment: GitReviewCommentDraft) {
				if (isReviewExcludedPath(comment.filePath)) return
				yield* SubscriptionRef.update(state, current => gitReviewStateSaveComment(current, comment))
			}),
			state,
			unmark: (marks: GitReviewState['marks']) =>
				SubscriptionRef.update(state, current => gitReviewStateUnmark(current, marks))
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}

export class GitPublish extends Context.Service<GitPublish>()('@deslop/git/service/GitPublish', {
	make: Effect.fn('GitPublish.make')(function* (config: {cwd: string}) {
		const git = yield* GitCommand
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
			const commits = commitsFromRecords(output)
			return Array.takeWhile(commits, commit => commit.checkpoint)
		})
		const headCommitMessage = pipe(
			git.string(config.cwd, ['log', '-1', '--format=%B', 'HEAD']),
			Effect.map(String.trim),
			Effect.catchTag('GitError', () => Effect.succeed(''))
		)
		const commitAll = Effect.fn('GitPublish.commitAll')(function* (message: string) {
			yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
			yield* pipe(git.stringWithInput(config.cwd, ['commit', '-F', '-'], message), Effect.asVoid)
		})
		const push = Effect.gen(function* () {
			if (!(yield* hasPushableCommits)) return
			const branch = yield* currentBranch
			yield* pipe(git.string(config.cwd, ['push', '-u', 'origin', `HEAD:${branch}`]), Effect.asVoid)
			if (yield* hasPushableCommits) {
				return yield* GitError.make({message: 'Push completed but the branch still has unpushed commits.'})
			}
		})
		return {
			checkpoint: Effect.gen(function* () {
				if (!(yield* hasWorktreeChanges)) return yield* GitError.make({message: 'No changes to checkpoint.'})
				yield* pipe(git.string(config.cwd, ['add', '-A']), Effect.asVoid)
				yield* pipe(
					git.stringWithInput(config.cwd, ['commit', '-F', '-'], `checkpoint\n\n${checkpointCommit.trailer}\n`),
					Effect.asVoid
				)
			}),
			publish: Effect.fn('GitPublish.publish')(function* (input: {message: string}) {
				const checkpoints = yield* headCheckpointCommits
				const dirty = yield* hasWorktreeChanges
				const inputMessage = String.trim(input.message)
				if (String.isEmpty(inputMessage) && (dirty || !Array.isReadonlyArrayEmpty(checkpoints))) {
					return yield* GitError.make({message: 'Publish message required.'})
				}
				const message = String.isNonEmpty(inputMessage) ? inputMessage : yield* headCommitMessage
				const committed = dirty || !Array.isReadonlyArrayEmpty(checkpoints)
				if (Array.isReadonlyArrayEmpty(checkpoints)) {
					if (dirty) yield* commitAll(message)
				} else {
					const oldest = pipe(checkpoints, Array.last, Option.getOrUndefined)
					if (Predicate.isUndefined(oldest)) return yield* GitError.make({message: 'Checkpoint state is invalid.'})
					const backupRef = `refs/deslop/backups/${yield* Clock.currentTimeMillis}-${randomUUID()}`
					yield* pipe(git.string(config.cwd, ['update-ref', backupRef, 'HEAD']), Effect.asVoid)
					yield* pipe(git.string(config.cwd, ['reset', '--soft', `${oldest.hash}^`]), Effect.asVoid)
					yield* pipe(
						commitAll(message),
						Effect.catchTag('GitError', error =>
							pipe(
								git.string(config.cwd, ['reset', '--hard', backupRef]),
								Effect.ignore,
								Effect.andThen(Effect.fail(error))
							)
						)
					)
				}
				const pushed = yield* pipe(
					hasPushableCommits,
					Effect.flatMap(shouldPush => (shouldPush ? pipe(push, Effect.as(true)) : Effect.succeed(false)))
				)
				if (!committed && !pushed) {
					return yield* GitError.make({message: 'No changes or unpushed commits to publish.'})
				}
			})
		}
	})
}) {
	public static layer = flow(this.make, layer => pipe(Layer.effect(this, layer), Layer.provide(GitCommand.layer)))
}
