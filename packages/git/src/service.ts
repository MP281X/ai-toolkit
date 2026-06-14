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
	GitWorktree,
	gitReviewTargetIsCommit,
	gitReviewTargetTag,
	gitReviewStateMark,
	gitReviewStateResolveComment,
	gitReviewStateSaveComment,
	gitReviewStateUnmark
} from './schema.ts'
import type {GitReviewMark, GitReviewTarget, GitWorktreeSource} from './schema.ts'

class GitCommand extends Context.Service<GitCommand>()('@deslop/git/service/GitCommand', {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

		const string = Effect.fn('GitCommand.string')(function* (
			cwd: string,
			args: readonly string[],
			options: {readonly trim?: boolean} = {}
		) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'git', cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* Effect.mapError(
						spawner.spawn(ChildProcess.make('git', args, {cwd, stderr: 'pipe', stdout: 'pipe'})),
						cause => new GitError({cause})
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* Effect.mapError(handle.exitCode, cause => new GitError({cause}))

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `git ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return options.trim === true ? String.trim(output.stdout) : output.stdout
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
					const handle = yield* Effect.mapError(
						spawner.spawn(
							ChildProcess.make('git', args, {
								cwd,
								stderr: 'pipe',
								stdin: Stream.make(Buffer.from(input, 'utf8')),
								stdout: 'pipe'
							})
						),
						cause => new GitError({cause})
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* Effect.mapError(handle.exitCode, cause => new GitError({cause}))

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

function isReviewExcludedPath(filePath: string) {
	const parts = String.split('/')(filePath)
	const basename = parts.at(-1) ?? filePath

	if (filePath === 'pnpm-lock.yaml') return true
	if (String.endsWith('.gen.ts')(basename)) return true
	return Array.some(
		parts,
		(part, index) =>
			index < parts.length - 1 &&
			((part === 'components' && (parts[index + 1] === 'ui' || parts[index + 1] === 'svgs')) ||
				(part === 'plans' && index === parts.length - 2 && String.endsWith('.md')(basename)))
	)
}

class GitHubPullRequestListItemResponse extends Schema.Class<GitHubPullRequestListItemResponse>(
	'GitHubPullRequestListItemResponse'
)({number: Schema.optional(Schema.Number), url: Schema.optional(Schema.String)}) {}
const GitHubPullRequestListResponse = Schema.Array(GitHubPullRequestListItemResponse)

class GitHubRepositoryResponse extends Schema.Class<GitHubRepositoryResponse>('GitHubRepositoryResponse')({
	name: Schema.String,
	owner: Schema.Struct({login: Schema.String})
}) {}

class GitHubReviewThreadCommentResponse extends Schema.Class<GitHubReviewThreadCommentResponse>(
	'GitHubReviewThreadCommentResponse'
)({
	body: Schema.String,
	line: Schema.optional(Schema.NullOr(Schema.Number)),
	originalLine: Schema.optional(Schema.NullOr(Schema.Number)),
	path: Schema.String,
	url: Schema.optional(Schema.String)
}) {}

class GitHubReviewThreadResponse extends Schema.Class<GitHubReviewThreadResponse>('GitHubReviewThreadResponse')({
	comments: Schema.Struct({nodes: Schema.Array(GitHubReviewThreadCommentResponse)}),
	diffSide: Schema.optional(Schema.String),
	id: Schema.String,
	isResolved: Schema.Boolean
}) {}

class GitHubPullRequestResponse extends Schema.Class<GitHubPullRequestResponse>('GitHubPullRequestResponse')({
	reviewThreads: Schema.optional(Schema.Struct({nodes: Schema.Array(GitHubReviewThreadResponse)}))
}) {}

class GitHubReviewRepositoryResponse extends Schema.Class<GitHubReviewRepositoryResponse>(
	'GitHubReviewRepositoryResponse'
)({pullRequest: Schema.optional(GitHubPullRequestResponse)}) {}

class GitHubReviewThreadsResponse extends Schema.Class<GitHubReviewThreadsResponse>('GitHubReviewThreadsResponse')({
	data: Schema.optional(Schema.Struct({repository: Schema.optional(GitHubReviewRepositoryResponse)}))
}) {}

function normalizePublicPath(value: string) {
	return String.startsWith('/private/var/')(value) ? String.replace(/^\/private/u, '')(value) : value
}

function pathSlug(value: string) {
	const slug = pipe(
		value,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9-]+/gu, '-'),
		String.replaceAll(/^-+|-+$/gu, '')
	)
	return slug === '' ? 'worktree' : slug
}

function repositorySlug(root: string) {
	const realRoot = NodeFs.realpathSync.native(root)
	const hash = String.slice(0, 10)(createHash('sha256').update(realRoot).digest('hex'))
	return `${pathSlug(String.split('/')(realRoot).at(-1) ?? realRoot)}-${hash}`
}

function sameProjectSnapshot(left: readonly GitProject[], right: readonly GitProject[]) {
	if (Array.length(left) !== Array.length(right)) return false
	return Array.every(left, (leftProject, projectIndex) =>
		Option.match(Array.get(right, projectIndex), {
			onNone: () => false,
			onSome: rightProject => {
				if (
					leftProject.repository.gitDirectory !== rightProject.repository.gitDirectory ||
					leftProject.repository.root !== rightProject.repository.root ||
					Array.length(leftProject.worktrees) !== Array.length(rightProject.worktrees)
				) {
					return false
				}

				return Array.every(leftProject.worktrees, (leftWorktree, worktreeIndex) =>
					Option.match(Array.get(rightProject.worktrees, worktreeIndex), {
						onNone: () => false,
						onSome: rightWorktree =>
							leftWorktree.branch === rightWorktree.branch && leftWorktree.root === rightWorktree.root
					})
				)
			}
		})
	)
}

function repositoryProbeOnlyPermissionErrors(stderr: string) {
	const lines = pipe(stderr, String.split(/\r?\n/u), Array.filter(String.isNonEmpty))
	return (
		!Array.isReadonlyArrayEmpty(lines) &&
		Array.every(lines, line =>
			/: (?:Permission denied|Operation not permitted|Access is denied\.?) \(os error (?:1|5|13)\)$/u.test(line)
		)
	)
}

function segmentsByFile(segments: readonly GitDiffSegment[]) {
	return Array.reduce(segments, HashMap.empty<string, readonly GitDiffSegment[]>(), (groups, segment) =>
		HashMap.modifyAt(groups, segment.filePath, segmentsForFile =>
			Option.some(
				Array.append(
					Option.getOrElse(segmentsForFile, () => Array.empty<GitDiffSegment>()),
					segment
				)
			)
		)
	)
}

function diffFromPatchChunk(chunk: string, segments: HashMap.HashMap<string, readonly GitDiffSegment[]>) {
	const deleted = /^deleted file mode /mu.test(chunk)
	const filePath =
		(deleted ? /^--- a\/(.+)$/mu.exec(chunk)?.[1] : undefined) ??
		/^\+\+\+ b\/(.+)$/mu.exec(chunk)?.[1] ??
		/^--- a\/(.+)$/mu.exec(chunk)?.[1] ??
		/^diff --git a\/.+ b\/(.+)$/mu.exec(chunk)?.[1] ??
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
	const result = Array.reduce(
		String.split('\u0000')(output),
		{
			branch: '',
			hasHead: false,
			records: Array.empty<{readonly branch: string; readonly hasHead: boolean; readonly root: string}>(),
			root: ''
		},
		(state, field) => {
			if (String.startsWith('worktree ')(field)) {
				return {
					branch: '',
					hasHead: false,
					records:
						String.isNonEmpty(state.root) && state.hasHead
							? Array.append(state.records, {branch: state.branch, hasHead: state.hasHead, root: state.root})
							: state.records,
					root: String.replace(/^worktree\s+/u, '')(field)
				}
			}
			if (String.startsWith('HEAD ')(field)) return {...state, hasHead: true}
			if (String.startsWith('branch refs/heads/')(field)) {
				return {...state, branch: String.replace(/^branch\s+refs\/heads\//u, '')(field)}
			}
			return state
		}
	)

	const records =
		String.isNonEmpty(result.root) && result.hasHead
			? Array.append(result.records, {branch: result.branch, hasHead: result.hasHead, root: result.root})
			: result.records
	return Array.map(records, record =>
		String.isNonEmpty(record.branch)
			? {branch: record.branch, hasHead: record.hasHead, root: record.root}
			: {hasHead: record.hasHead, root: record.root}
	)
}

export class GitWorkspace extends Context.Service<GitWorkspace>()('@deslop/git/service/GitWorkspace', {
	make: Effect.gen(function* () {
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const home = yield* Config.withDefault(Config.string('HOME'), homedir())
		const projects = yield* SubscriptionRef.make(Array.empty<GitProject>())

		const worktreeClean = Effect.fn('GitWorkspace.worktreeClean')(function* (cwd: string) {
			return yield* Effect.map(git.lines(cwd, ['status', '--porcelain']), Array.isReadonlyArrayEmpty)
		})

		const fixProject = Effect.fn('GitWorkspace.fixProject')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})

			const root = yield* Effect.sync(() => NodeFs.realpathSync.native(cwd))
			yield* Effect.asVoid(git.string(cwd, ['worktree', 'prune']))
			yield* Effect.asVoid(git.string(cwd, ['fetch', '--all', '--prune']))
			const defaultBranch = yield* Effect.map(
				git.string(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {trim: true}),
				String.replace(/^origin\//u, '')
			)
			const mergedBranches = new Set(
				yield* git.lines(cwd, ['branch', '--merged', `origin/${defaultBranch}`, '--format=%(refname:short)'])
			)
			const branchLines = yield* git.lines(cwd, [
				'for-each-ref',
				'refs/heads',
				'--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(worktreepath)'
			])

			function deleteBranchWorktree(branch: string, worktreePath: string) {
				return Effect.gen(function* () {
					if (String.isNonEmpty(worktreePath)) {
						yield* git.string(cwd, ['worktree', 'remove', '--force', worktreePath])
					}

					yield* git.string(cwd, ['branch', '-D', branch])
				})
			}

			function fastForwardBehindBranch(branch: string, upstream: string, worktreePath: string) {
				return Effect.gen(function* () {
					const targetCwd = String.isNonEmpty(worktreePath) ? worktreePath : cwd
					if (!(yield* worktreeClean(targetCwd))) return
					if (String.isNonEmpty(worktreePath)) {
						yield* Effect.asVoid(git.string(worktreePath, ['merge', '--ff-only', upstream]))
						return
					}

					yield* Effect.asVoid(git.string(cwd, ['branch', '-f', branch, upstream]))
				})
			}

			function rebaseDivergedBranch(upstream: string, worktreePath: string) {
				return Effect.gen(function* () {
					const targetCwd = String.isNonEmpty(worktreePath) ? worktreePath : cwd
					if (!(yield* worktreeClean(targetCwd))) return

					yield* pipe(
						git.string(targetCwd, ['rebase', upstream]),
						Effect.tapError(() => git.string(targetCwd, ['rebase', '--abort'])),
						Effect.asVoid
					)
				})
			}

			function fixBranch(branchLine: string) {
				return Effect.gen(function* () {
					const fields = String.split('\u0000')(branchLine)
					const branch = Option.getOrElse(Array.get(fields, 0), () => '')
					const upstream = Option.getOrElse(Array.get(fields, 1), () => '')
					const track = Option.getOrElse(Array.get(fields, 2), () => '')
					const worktreePath = Option.getOrElse(Array.get(fields, 3), () => '')
					if (String.isEmpty(branch)) return
					const worktreeRoot = String.isNonEmpty(worktreePath)
						? yield* Effect.sync(() =>
								NodeFs.existsSync(worktreePath) ? NodeFs.realpathSync.native(worktreePath) : worktreePath
							)
						: ''
					const checkedOutRoot = worktreeRoot === root
					if (track === '[gone]') {
						if (checkedOutRoot) return
						return yield* deleteBranchWorktree(branch, worktreePath)
					}
					if (String.isEmpty(upstream) && branch !== defaultBranch && mergedBranches.has(branch)) {
						if (checkedOutRoot) return
						return yield* deleteBranchWorktree(branch, worktreePath)
					}
					if (String.includes('behind')(track) && !String.includes('ahead')(track)) {
						return yield* fastForwardBehindBranch(branch, upstream, worktreePath)
					}
					if (!String.includes('ahead')(track) || !String.includes('behind')(track)) return

					return yield* rebaseDivergedBranch(upstream, worktreePath)
				})
			}

			yield* Effect.forEach(branchLines, fixBranch, {discard: true})
		})

		const getDefaultBranch = Effect.fn('GitWorkspace.getDefaultBranch')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* Effect.map(
				git.string(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {trim: true}),
				String.replace(/^origin\//u, '')
			)
		})

		const repositoryProbeOutput = Effect.fnUntraced(function* (searchRoots: readonly string[]) {
			const args = [
				'--hidden',
				'--files',
				...Array.flatMap(
					['!**/.*/**', '**/.git/HEAD', '!**/node_modules/**', '!**/dist/**', '!**/build/**', '!**/target/**'],
					glob => ['-g', glob]
				),
				...searchRoots
			]
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* Effect.mapError(
						spawner.spawn(ChildProcess.make('rg', args, {stderr: 'pipe', stdout: 'pipe'})),
						cause => new GitError({cause})
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* Effect.mapError(handle.exitCode, cause => new GitError({cause}))

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
		function directRepositoryRoot(root: string) {
			return Effect.sync(() =>
				NodeFs.existsSync(path.join(root, '.git', 'HEAD'))
					? Option.some(normalizePublicPath(root))
					: Option.none<string>()
			)
		}
		const repositorySearchRoots = Effect.fn('GitWorkspace.repositorySearchRoots')(function* (root: string) {
			if (root !== home) return [root]

			const entries = yield* fs.readDirectory(root)
			return yield* pipe(
				entries,
				Array.filter(
					entry => !Array.contains(['Applications', 'Library', 'Movies', 'Music', 'Pictures', 'Public'], entry)
				),
				Array.filter(entry => !Array.contains(['.git', 'build', 'dist', 'node_modules', 'target'], entry)),
				Array.filter(entry => !String.startsWith('.')(entry)),
				Effect.forEach(entry =>
					Effect.gen(function* () {
						const directory = path.join(root, entry)
						const info = yield* fs.stat(directory)
						return info.type === 'Directory' ? directory : ''
					})
				),
				Effect.map(Array.filter(String.isNonEmpty))
			)
		})
		const repositoryRootsFromProbe = Effect.fn('GitWorkspace.repositoryRootsFromProbe')(function* (root: string) {
			const directRoot = yield* directRepositoryRoot(root)
			if (Option.isSome(directRoot)) return [directRoot.value]

			const searchRoots = yield* repositorySearchRoots(root)
			if (Array.isReadonlyArrayEmpty(searchRoots)) return Array.empty<string>()

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
			return yield* Effect.map(
				Effect.all(
					{
						gitDirectory: Effect.map(
							git.string(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'], {trim: true}),
							normalizePublicPath
						),
						worktrees: Effect.map(git.string(root, ['worktree', 'list', '--porcelain', '-z']), parseWorktreeRecords)
					},
					{concurrency: 'unbounded'}
				),
				repository =>
					new GitRepository({
						gitDirectory: repository.gitDirectory,
						root: normalizePublicPath(repository.worktrees[0]?.root ?? root)
					})
			)
		})
		const listWorktrees = Effect.fn('GitWorkspace.listWorktrees')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			const worktrees = yield* Effect.flatMap(git.string(cwd, ['worktree', 'list', '--porcelain', '-z']), output =>
				Effect.withSpan(
					Effect.sync(() => parseWorktreeRecords(output)),
					'GitWorkspace.parseWorktrees',
					{attributes: {cwd}}
				)
			)
			yield* Effect.annotateCurrentSpan({worktreeCount: Array.length(worktrees)})

			return Array.map(
				worktrees,
				worktree => new GitWorktree({branch: worktree.branch, root: normalizePublicPath(worktree.root)})
			)
		})

		const listRepositoriesFrom = Effect.fn('GitWorkspace.listRepositoriesFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				repositoryRootsFromProbe(cwd),
				Effect.flatMap(Effect.forEach(repositoryFromRoot, {concurrency: 32})),
				Effect.map(repositories =>
					Array.dedupeWith(
						repositories,
						(left, right) => left.gitDirectory === right.gitDirectory || left.root === right.root
					)
				)
			)
		})
		const listProjectsFrom = Effect.fn('GitWorkspace.listProjectsFrom')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})
			const repositories = yield* listRepositoriesFrom(cwd)
			const discovered = yield* Effect.forEach(
				repositories,
				repository =>
					Effect.map(
						listWorktrees(repository.root),
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
					),
				{concurrency: 'unbounded'}
			)
			return Array.sortWith(discovered, project => project.repository.root, Order.String)
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
							Effect.map(git.lines(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']), lines =>
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
				const creatingNewBranch = Match.value(input.source).pipe(
					Match.tag('new', () => true),
					Match.orElse(() => false)
				)
				if (creatingNewBranch && !/^(feat|fix|refactor|perf|test|docs|chore)\/[a-z0-9-]+$/u.test(input.branch)) {
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
					pathSlug(input.branch)
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

				yield* fs.makeDirectory(path.dirname(targetDirectory), {recursive: true})

				yield* Match.value(input.source).pipe(
					Match.tag('local', () =>
						pipe(
							Effect.annotateCurrentSpan({source: 'local'}),
							Effect.andThen(git.string(input.cwd, ['worktree', 'add', targetDirectory, input.branch])),
							Effect.asVoid
						)
					),
					Match.tag('remote', source =>
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
					Match.tag('new', () =>
						Effect.gen(function* () {
							const defaultBranch = yield* getDefaultBranch(input.cwd)

							yield* Effect.annotateCurrentSpan({source: 'new'})
							yield* Effect.asVoid(
								git.string(input.cwd, [
									'worktree',
									'add',
									'--no-track',
									'-b',
									input.branch,
									targetDirectory,
									`origin/${defaultBranch}`
								])
							)
						})
					),
					Match.exhaustive
				)
				yield* refreshProjects()
				return yield* createdWorktreeRoot
			}),
			deleteWorktree: Effect.fn('GitWorkspace.deleteWorktree')(function* (input: {readonly cwd: string}) {
				yield* Effect.annotateCurrentSpan({cwd: input.cwd})
				const worktrees = yield* Effect.map(
					git.string(input.cwd, ['worktree', 'list', '--porcelain', '-z']),
					parseWorktreeRecords
				)
				const mainRoot = worktrees[0]?.root ?? input.cwd
				const branch = pipe(
					worktrees,
					Array.findFirst(worktree => worktree.root === input.cwd),
					Option.map(worktree => worktree.branch),
					Option.getOrUndefined
				)

				yield* Effect.asVoid(git.string(mainRoot, ['worktree', 'remove', '--force', input.cwd]))

				if (Predicate.isNotUndefined(branch)) {
					yield* Effect.asVoid(git.string(mainRoot, ['branch', '-D', branch]))
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
	public static layer = Layer.provide(Layer.effect(this, this.make), GitCommand.layer)
}

export class GitReview extends Context.Service<GitReview>()('@deslop/git/service/GitReview', {
	make: Effect.fn('GitReview.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const state = yield* SubscriptionRef.make(new GitReviewState({comments: [], marks: []}))
		const githubCommentsRef = yield* Ref.make<Option.Option<readonly GitReviewComment[]>>(Option.none())

		const hasWorktreeChanges = Effect.map(
			git.lines(config.cwd, ['status', '--porcelain']),
			lines => !Array.isReadonlyArrayEmpty(lines)
		)

		function diffsFromPatch(patch: string, segments: readonly GitDiffSegment[]) {
			const groupedSegments = segmentsByFile(segments)

			return pipe(
				String.split(/(?=^diff --git )/mu)(patch),
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
				':(exclude)pnpm-lock.yaml',
				':(exclude)*.gen.ts',
				':(exclude)**/*.gen.ts',
				':(exclude)components/ui/**',
				':(exclude)**/components/ui/**',
				':(exclude)components/svgs/**',
				':(exclude)**/components/svgs/**',
				':(exclude)plans/*.md',
				':(exclude)**/plans/*.md'
			])

			const diffs = Array.filter(diffsFromPatch(patch, input.segments), diff => !isReviewExcludedPath(diff.filePath))
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
			const pathspec = [
				'--',
				'.',
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
			const patch = yield* Effect.flatMap(git.string(config.cwd, ['diff-tree', ...args, hash, ...pathspec]), output => {
				if (/^diff --git /mu.test(output)) return Effect.succeed(output)

				return pipe(
					git.string(config.cwd, ['rev-list', '--parents', '-n', '1', hash], {trim: true}),
					Effect.map(String.split(/\s+/u)),
					Effect.flatMap(parents => {
						if (parents[1] === undefined) return Effect.succeed(output)

						return git.string(config.cwd, ['diff-tree', ...args, parents[1], hash, ...pathspec])
					})
				)
			})
			const diffs = Array.filter(diffsFromPatch(patch, Array.empty()), diff => !isReviewExcludedPath(diff.filePath))
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
						Effect.map(fs.readFileString(path.join(config.cwd, filePath)), content => {
							const patch = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${Array.length(String.split('\n')(content))} @@\n${pipe(
								String.split('\n')(content),
								Array.map(line => `+${line}`),
								Array.join('\n')
							)}`

							return new GitDiff({
								filePath,
								patch,
								segments: [new GitDiffSegment({filePath, fingerprint: patch, id: 'HEAD->worktree', type: 'worktree'})],
								status: 'added'
							})
						}),
					{concurrency: 'unbounded'}
				)
			)
		)

		const worktreeDiffs = Effect.gen(function* () {
			const status = yield* git.lines(config.cwd, ['status', '--porcelain'])
			if (Array.isReadonlyArrayEmpty(status)) return Array.empty<GitDiff>()

			const diffs = yield* Effect.map(
				Effect.all([gitDiffs({args: ['HEAD'], segments: Array.empty()}), untrackedDiffs], {concurrency: 'unbounded'}),
				([trackedDiffs, untracked]) =>
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

			return diffs
		}).pipe(Effect.withSpan('GitReview.worktreeDiffs', {attributes: {cwd: config.cwd}}))

		const fileContent = Effect.fn('GitReview.fileContent')(function* (input: {
			readonly filePath: string
			readonly target: GitReviewTarget
		}) {
			yield* Effect.annotateCurrentSpan({
				cwd: config.cwd,
				filePath: input.filePath,
				target: gitReviewTargetTag(input.target)
			})
			return yield* Match.value(input.target).pipe(
				Match.tag('commit', target => git.string(config.cwd, ['show', `${target.hash}:${input.filePath}`])),
				Match.orElse(() => fs.readFileString(path.join(config.cwd, input.filePath)))
			)
		})

		const reviewDiffs = Effect.fn('GitReview.reviewDiffs')(function* (target: GitReviewTarget) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, target: gitReviewTargetTag(target)})
			return yield* Match.value(target).pipe(
				Match.tag('changes', () =>
					Effect.gen(function* () {
						return yield* worktreeDiffs
					})
				),
				Match.tag('commit', commit =>
					Effect.gen(function* () {
						const id = `${commit.hash}^->${commit.hash}`
						const diffs = yield* commitDiffs(commit.hash)
						const diffsWithSegments = withDisplayedPatchSegments(diffs, id, 'commit')
						yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

						return diffsWithSegments
					})
				),
				Match.tag('local', () =>
					Effect.gen(function* () {
						const base = yield* localBase()
						const diffs = yield* aggregateDiffs(base)
						const diffsWithSegments = withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree')
						yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

						return diffsWithSegments
					})
				),
				Match.tag('branch', () =>
					Effect.gen(function* () {
						const base = yield* branchDiffBase()
						const diffs = yield* aggregateDiffs(base)
						const diffsWithSegments = withDisplayedPatchSegments(diffs, `${base}->worktree`, 'worktree')
						yield* Effect.annotateCurrentSpan({diffCount: Array.length(diffsWithSegments)})

						return diffsWithSegments
					})
				),
				Match.exhaustive
			)
		})

		const ghString = Effect.fn('gh.string')(function* (args: readonly string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd: config.cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* Effect.mapError(
						spawner.spawn(ChildProcess.make('gh', args, {cwd: config.cwd, stderr: 'pipe', stdout: 'pipe'})),
						cause => new GitError({cause})
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* Effect.mapError(handle.exitCode, cause => new GitError({cause}))

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `gh ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return output.stdout
				})
			).pipe(Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd: config.cwd}}))
		})

		const currentBranch = git.string(config.cwd, ['branch', '--show-current'], {trim: true})

		const defaultBranchName = Effect.map(
			git.string(config.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {trim: true}),
			String.replace(/^origin\//u, '')
		)

		const currentUpstream = Effect.gen(function* () {
			const branch = yield* currentBranch
			return yield* Effect.map(
				git.string(config.cwd, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`], {trim: true}),
				value => (String.isNonEmpty(value) ? Option.some(value) : Option.none<string>())
			)
		})

		const pullRequestsForCurrentBranch = Effect.gen(function* () {
			const branch = yield* currentBranch
			const response = yield* ghString(['pr', 'list', '--head', branch, '--json', 'number,url', '--limit', '1'])
			return yield* Effect.mapError(
				Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubPullRequestListResponse))(response),
				cause => new GitError({cause, message: 'Failed to parse GitHub pull request list.'})
			)
		})

		const branchBase = Effect.fn('GitReview.branchBase')(function* (defaultBranch: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, defaultBranch})
			return `origin/${defaultBranch}`
		})

		const branchPrUrl = Effect.map(pullRequestsForCurrentBranch, pullRequests =>
			pipe(
				pullRequests,
				Array.findFirst(pullRequest => Predicate.isNotUndefined(pullRequest.url)),
				Option.flatMap(pullRequest =>
					Predicate.isNotUndefined(pullRequest.url) ? Option.some(pullRequest.url) : Option.none<string>()
				)
			)
		)

		const commits = Effect.fn('GitReview.commits')(function* (base: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const from = yield* git.string(config.cwd, ['merge-base', base, 'HEAD'], {trim: true})

			return yield* Effect.map(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s', `${from}..HEAD`]),
				Array.map(commitFromLogLine)
			)
		})

		const commitsBetween = Effect.fn('GitReview.commitsBetween')(function* (from: string, to: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			return yield* Effect.map(
				git.lines(config.cwd, ['log', '--max-count=80', '--format=%H%x00%h%x00%s', `${from}..${to}`]),
				Array.map(commitFromLogLine)
			)
		})

		const firstParentCommits = Effect.map(
			git.lines(config.cwd, ['log', '--first-parent', '--max-count=80', '--format=%H%x00%h%x00%s', 'HEAD']),
			Array.map(commitFromLogLine)
		)

		const pushableCommitCount = Effect.fn('GitReview.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* currentUpstream

			if (Option.isSome(upstream)) {
				return yield* Effect.map(
					git.string(config.cwd, ['rev-list', '--count', `${upstream.value}..HEAD`], {trim: true}),
					value => Option.getOrElse(Number.parse(value), () => 0)
				)
			}

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			const from = yield* git.string(config.cwd, ['merge-base', base, 'HEAD'], {trim: true})

			return yield* Effect.map(git.string(config.cwd, ['rev-list', '--count', `${from}..HEAD`], {trim: true}), value =>
				Option.getOrElse(Number.parse(value), () => 0)
			)
		})

		const hasPushableCommits = Effect.map(pushableCommitCount(), count => count > 0)

		const upstreamCounts = Effect.fn('GitReview.upstreamCounts')(function* () {
			const upstream = yield* currentUpstream
			if (Option.isNone(upstream)) return

			return yield* Effect.map(
				git.string(config.cwd, ['rev-list', '--left-right', '--count', `${upstream.value}...HEAD`], {trim: true}),
				output => {
					const counts = String.split(/\s+/u)(output)
					return {
						ahead: Option.getOrElse(Number.parse(counts[1] ?? '0'), () => 0),
						behind: Option.getOrElse(Number.parse(counts[0]), () => 0)
					}
				}
			)
		})

		const localBase = Effect.fn('GitReview.localBase')(function* () {
			const upstream = yield* currentUpstream

			if (Option.isSome(upstream)) return upstream.value

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			return yield* git.string(config.cwd, ['merge-base', base, 'HEAD'], {trim: true})
		})

		const branchDiffBase = Effect.fn('GitReview.branchDiffBase')(function* () {
			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			return yield* git.string(config.cwd, ['merge-base', base, 'HEAD'], {trim: true})
		})

		const aggregateDiffs = Effect.fn('GitReview.aggregateDiffs')(function* (base: string) {
			const trackedDiffs = yield* gitDiffs({args: [base], segments: Array.empty()})
			const untracked = yield* untrackedDiffs
			return Array.appendAll(trackedDiffs, untracked)
		})

		const prReviewComments = Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const pr = Array.findFirst(yield* pullRequestsForCurrentBranch, pullRequest =>
				Predicate.isNotUndefined(pullRequest.number)
			)
			if (Option.isNone(pr) || Predicate.isUndefined(pr.value.number)) return Array.empty<GitReviewComment>()
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
				`number=${pr.value.number}`
			])
			const data = yield* Effect.mapError(
				Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubReviewThreadsResponse))(response),
				cause => new GitError({cause, message: 'Failed to parse GitHub review threads.'})
			)
			const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
			yield* Effect.annotateCurrentSpan({threadCount: Array.length(threads)})

			return Array.flatMap(threads, thread =>
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
		}).pipe(Effect.withSpan('GitReview.reviewComments', {attributes: {cwd: config.cwd}}))

		const githubComments = Effect.fnUntraced(function* () {
			const cached = yield* Ref.get(githubCommentsRef)
			if (Option.isSome(cached)) return cached.value

			const comments = yield* prReviewComments
			yield* Ref.set(githubCommentsRef, Option.some(comments))
			return comments
		})

		const reviewState = Effect.fn('GitReview.reviewState')(function* () {
			const current = yield* SubscriptionRef.get(state)
			const github = yield* githubComments()

			return new GitReviewState({
				comments: Array.filter(
					Array.appendAll(current.comments, github),
					comment => !isReviewExcludedPath(comment.filePath)
				),
				marks: Array.filter(current.marks, mark => !isReviewExcludedPath(mark.filePath))
			})
		})

		const worktreeChanges = yield* pipe(
			fs.watch(config.cwd),
			Stream.debounce(Duration.millis(50)),
			Stream.mapEffect(() =>
				Effect.map(git.lines(config.cwd, ['status', '--porcelain']), lines =>
					Array.some(lines, line => {
						const filePath = String.trim(String.slice(3)(line))
						return String.isNonEmpty(filePath) && !isReviewExcludedPath(filePath)
					})
				)
			),
			Stream.filter(Predicate.isTruthy),
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
			fileContent,
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
				yield* Effect.asVoid(ghString(['api', 'graphql', '-f', `query=${query}`, '-f', `threadId=${threadId}`]))
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
				const diffs = reviewDiffs(target)
				if (gitReviewTargetIsCommit(target)) return Stream.fromEffect(diffs)

				return Stream.fromEffect(diffs).pipe(
					Stream.concat(Stream.mapEffect(worktreeChanges, () => diffs)),
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
					Stream.concat(Stream.mapEffect(worktreeChanges, () => metadata())),
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
	public static layer = flow(this.make, layer => Layer.provide(Layer.effect(this, layer), GitCommand.layer))
}

export class GitPublish extends Context.Service<GitPublish>()('@deslop/git/service/GitPublish', {
	make: Effect.fn('GitPublish.make')(function* (config: {readonly cwd: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const git = yield* GitCommand

		const ghString = Effect.fn('gh.string')(function* (args: readonly string[]) {
			yield* Effect.annotateCurrentSpan({command: args[0] ?? 'gh', cwd: config.cwd})
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* Effect.mapError(
						spawner.spawn(ChildProcess.make('gh', args, {cwd: config.cwd, stderr: 'pipe', stdout: 'pipe'})),
						cause => new GitError({cause})
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.mapError(cause => new GitError({cause}))
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* Effect.mapError(handle.exitCode, cause => new GitError({cause}))

					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new GitError({
							cause: new Error(output.stderr || output.stdout || `gh ${Array.join(' ')(args)} exited with ${exitCode}`)
						})
					}

					return output.stdout
				})
			).pipe(Effect.withSpan('gh.command', {attributes: {command: args[0] ?? 'gh', cwd: config.cwd}}))
		})

		const hasWorktreeChanges = Effect.map(
			git.lines(config.cwd, ['status', '--porcelain']),
			lines => !Array.isReadonlyArrayEmpty(lines)
		)
		const currentBranch = git.string(config.cwd, ['branch', '--show-current'], {trim: true})
		const defaultBranchName = Effect.map(
			git.string(config.cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {trim: true}),
			String.replace(/^origin\//u, '')
		)
		const currentUpstream = Effect.gen(function* () {
			const branch = yield* currentBranch
			return yield* Effect.map(
				git.string(config.cwd, ['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`], {trim: true}),
				value => (String.isNonEmpty(value) ? Option.some(value) : Option.none<string>())
			)
		})
		const pullRequestsForCurrentBranch = Effect.gen(function* () {
			const branch = yield* currentBranch
			const response = yield* ghString(['pr', 'list', '--head', branch, '--json', 'number,url', '--limit', '1'])
			return yield* Effect.mapError(
				Schema.decodeUnknownEffect(Schema.fromJsonString(GitHubPullRequestListResponse))(response),
				cause => new GitError({cause, message: 'Failed to parse GitHub pull request list.'})
			)
		})
		const branchBase = Effect.fn('GitPublish.branchBase')(function* (defaultBranch: string) {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd, defaultBranch})
			return `origin/${defaultBranch}`
		})
		const currentPullRequest = Effect.map(pullRequestsForCurrentBranch, pullRequests =>
			pipe(
				pullRequests,
				Array.findFirst(pullRequest => Predicate.isNotUndefined(pullRequest.url)),
				Option.flatMap(pullRequest =>
					Predicate.isNotUndefined(pullRequest.url)
						? Option.some(new GitPullRequest({url: pullRequest.url}))
						: Option.none<GitPullRequest>()
				)
			)
		)
		const pushableCommitCount = Effect.fn('GitPublish.pushableCommitCount')(function* () {
			yield* Effect.annotateCurrentSpan({cwd: config.cwd})
			const upstream = yield* currentUpstream

			if (Option.isSome(upstream)) {
				return yield* Effect.map(
					git.string(config.cwd, ['rev-list', '--count', `${upstream.value}..HEAD`], {trim: true}),
					value => Option.getOrElse(Number.parse(value), () => 0)
				)
			}

			const defaultBranch = yield* defaultBranchName
			const base = yield* branchBase(defaultBranch)
			const from = yield* git.string(config.cwd, ['merge-base', base, 'HEAD'], {trim: true})

			return yield* Effect.map(git.string(config.cwd, ['rev-list', '--count', `${from}..HEAD`], {trim: true}), value =>
				Option.getOrElse(Number.parse(value), () => 0)
			)
		})
		const hasPushableCommits = Effect.map(pushableCommitCount(), count => count > 0)
		const createDraftPr = Effect.map(ghString(['pr', 'create', '--draft', '--fill']), output => {
			const url = /https?:\/\/\S+/u.exec(output)?.[0] ?? String.trim(output)
			return String.isNonEmpty(url) ? Option.some(new GitPullRequest({url})) : Option.none<GitPullRequest>()
		})
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

			return yield* Effect.withSpan(createDraftPr, 'GitPublish.createDraftPr', {attributes: {branch, cwd: config.cwd}})
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
	public static layer = flow(this.make, layer => Layer.provide(Layer.effect(this, layer), GitCommand.layer))
}
