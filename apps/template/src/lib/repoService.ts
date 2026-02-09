import {createHash, randomUUID} from 'node:crypto'
import {type Dirent, promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {Effect, pipe} from 'effect'

import type {
	AiContent,
	Comment,
	CommentInput,
	DiffHunk,
	DiffLine,
	FileChange,
	FileDiff,
	PlanExport,
	PullRequestResult,
	RepoState,
	RepoSummary,
	StageTarget
} from '#rpcs/repos/contracts.ts'

type RepoSummaryType = typeof RepoSummary.Type
type RepoStateType = typeof RepoState.Type
type FileChangeType = typeof FileChange.Type
type FileDiffType = typeof FileDiff.Type
type DiffHunkType = typeof DiffHunk.Type
type DiffLineType = typeof DiffLine.Type
type StageTargetType = typeof StageTarget.Type
type CommentInputType = typeof CommentInput.Type
type CommentType = typeof Comment.Type
type AiContentType = typeof AiContent.Type
type PlanExportType = typeof PlanExport.Type
type PullRequestResultType = typeof PullRequestResult.Type

type CommentStore = Record<string, CommentType[]>
type RepoCache = Record<string, RepoSummaryType[]>

const configDir = path.join(os.homedir(), '.ai-toolkit')
const rootsFile = path.join(configDir, 'roots.json')
const repoCacheFile = path.join(configDir, 'repos-cache.json')
const commentsFile = path.join(configDir, 'comments.json')

function ensureConfigDir() {
	return Effect.tryPromise({
		try: () => fs.mkdir(configDir, {recursive: true}),
		catch: cause => (cause instanceof Error ? cause : new Error(`${cause}`))
	})
}

function readJson<T>(filePath: string, fallback: T) {
	return Effect.tryPromise({
		try: async () => {
			try {
				const content = await fs.readFile(filePath, 'utf-8')
				return JSON.parse(content) as T
			} catch {
				return fallback
			}
		},
		catch: cause => (cause instanceof Error ? cause : new Error(`${cause}`))
	})
}

function writeJson(filePath: string, data: unknown) {
	return Effect.tryPromise({
		try: () => fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8'),
		catch: cause => (cause instanceof Error ? cause : new Error(`${cause}`))
	})
}

function runCli(command: string, args: readonly string[], cwd: string, stdin?: string) {
	return Effect.tryPromise({
		try: async () => {
			const input = stdin ? new TextEncoder().encode(stdin) : undefined
			const process = Bun.spawn([command, ...args], {
				cwd,
				stdin: input,
				stdout: 'pipe',
				stderr: 'pipe'
			})

			const [stdout, stderr] = await Promise.all([
				new Response(process.stdout).text(),
				new Response(process.stderr).text()
			])
			const exitCode = await process.exited

			if (exitCode !== 0) throw new Error(stderr || stdout || `git ${args.join(' ')} failed`)

			return stdout.trim()
		},
		catch: cause => (cause instanceof Error ? cause : new Error(`${cause}`))
	})
}

function runGit(args: readonly string[], cwd: string, stdin?: string) {
	return runCli('git', args, cwd, stdin)
}

function statusLabel(code: string) {
	if (code === 'M') return 'modified'
	if (code === 'A') return 'added'
	if (code === 'D') return 'deleted'
	if (code === 'R') return 'renamed'
	if (code === '?') return 'untracked'
	return code
}

function parseStatus(output: string) {
	const staged: FileChangeType[] = []
	const unstaged: FileChangeType[] = []

	const lines = output.split('\n').filter(line => line.length > 0)

	for (const line of lines) {
		const status = line.slice(0, 2)
		const filePath = line.slice(3).trim()

		if (status === '??') {
			unstaged.push({path: filePath, status: 'untracked'})
			continue
		}

		const stagedCode = status[0] ?? ' '
		const unstagedCode = status[1] ?? ' '

		if (stagedCode !== ' ') staged.push({path: filePath, status: statusLabel(stagedCode)})
		if (unstagedCode !== ' ') unstaged.push({path: filePath, status: statusLabel(unstagedCode)})
	}

	return {staged, unstaged}
}

function parseDiff(repoPath: string, filePath: string, staged: boolean, output: string) {
	const hunks: DiffHunkType[] = []
	const lines = output.split('\n')

	type MutableHunk = Omit<DiffHunkType, 'lines'>

	let currentHunk: MutableHunk | undefined
	let currentLines: DiffLineType[] = []
	let oldLine = 0
	let newLine = 0

	for (const line of lines) {
		if (line.startsWith('@@')) {
			const match = /@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/.exec(line)
			if (!match) continue

			if (currentHunk) hunks.push({...currentHunk, lines: currentLines})

			const oldStart = +(match[1] ?? '0')
			const oldCount = +(match[2] ?? '0')
			const newStart = +(match[3] ?? '0')
			const newCount = +(match[4] ?? '0')

			currentHunk = {
				id: `${filePath}-${staged ? 'staged' : 'unstaged'}-hunk-${hunks.length}`,
				header: line,
				oldStart,
				oldLines: oldCount,
				newStart,
				newLines: newCount
			}
			currentLines = []

			oldLine = oldStart
			newLine = newStart
			continue
		}

		if (!currentHunk) continue
		if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) continue

		if (line.startsWith('+')) {
			currentLines.push({
				kind: 'add',
				content: line.slice(1),
				newNumber: newLine
			})
			newLine += 1
			continue
		}

		if (line.startsWith('-')) {
			currentLines.push({
				kind: 'del',
				content: line.slice(1),
				oldNumber: oldLine
			})
			oldLine += 1
			continue
		}

		if (line.startsWith(' ')) {
			currentLines.push({
				kind: 'context',
				content: line.slice(1),
				oldNumber: oldLine,
				newNumber: newLine
			})
			oldLine += 1
			newLine += 1
		}
	}

	if (currentHunk) hunks.push({...currentHunk, lines: currentLines})

	return {repoPath, filePath, staged, hunks}
}

function buildHunkPatch(filePath: string, hunk: DiffHunkType) {
	const body = hunk.lines
		.map(line => {
			if (line.kind === 'add') return `+${line.content}`
			if (line.kind === 'del') return `-${line.content}`
			return ` ${line.content}`
		})
		.join('\n')

	return [
		`diff --git a/${filePath} b/${filePath}`,
		`--- a/${filePath}`,
		`+++ b/${filePath}`,
		hunk.header,
		body,
		''
	].join('\n')
}

function buildRangePatch(filePath: string, hunk: DiffHunkType, start: number, end: number) {
	const selection = hunk.lines.slice(start, end + 1)

	const firstOld = selection.find(line => line.oldNumber !== undefined)?.oldNumber
	const firstNew = selection.find(line => line.newNumber !== undefined)?.newNumber

	const oldStart = firstOld ?? Math.max(0, (firstNew ?? 1) - 1)
	const newStart = firstNew ?? oldStart

	const oldCount = selection.filter(line => line.oldNumber !== undefined).length
	const newCount = selection.filter(line => line.newNumber !== undefined).length

	const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`

	const body = selection
		.map(line => {
			if (line.kind === 'add') return `+${line.content}`
			if (line.kind === 'del') return `-${line.content}`
			return ` ${line.content}`
		})
		.join('\n')

	return [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, header, body, ''].join(
		'\n'
	)
}

function applyPatch(repoPath: string, patch: string, cached: boolean, reverse: boolean) {
	const args = ['apply', '--unidiff-zero', '--whitespace=nowarn']
	if (cached) args.push('--cached')
	if (reverse) args.push('-R')

	return runGit(args, repoPath, patch)
}

function hashPath(repoPath: string) {
	return createHash('sha1').update(repoPath).digest('hex')
}

function repoName(repoPath: string) {
	return path.basename(repoPath)
}

function summarize(
	repoPath: string,
	branch: string,
	staged: readonly FileChangeType[],
	unstaged: readonly FileChangeType[]
) {
	const summary: RepoSummaryType = {
		name: repoName(repoPath),
		path: repoPath,
		branch,
		stagedCount: staged.length,
		unstagedCount: unstaged.length
	}

	return summary
}

function repoState(
	repoPath: string,
	branch: string,
	staged: readonly FileChangeType[],
	unstaged: readonly FileChangeType[]
) {
	const state: RepoStateType = {
		name: repoName(repoPath),
		path: repoPath,
		branch,
		staged,
		unstaged
	}
	return state
}

function buildPlan(state: RepoStateType, comments: CommentType[], suggestions: AiContentType) {
	const lines = [
		`# ${state.name} (${state.branch})`,
		'## Status',
		`- Staged: ${state.staged.length}`,
		`- Unstaged: ${state.unstaged.length}`,
		'## Files',
		...state.staged.map(file => `- [staged] ${file.path} (${file.status})`),
		...state.unstaged.map(file => `- [unstaged] ${file.path} (${file.status})`),
		'## Comments',
		...comments.map(comment => `- ${comment.scope}${comment.filePath ? ` ${comment.filePath}` : ''}: ${comment.text}`),
		'## AI Suggestions',
		'- Commit messages:',
		...suggestions.commitMessages.map(item => `  - ${item}`),
		'- Branch names:',
		...suggestions.branchNames.map(item => `  - ${item}`),
		'## Pull Request',
		`- Title: ${suggestions.pullRequest.title}`,
		'- Body:',
		suggestions.pullRequest.body,
		'## Action Plan',
		suggestions.plan
	]

	const plan: PlanExportType = {markdown: lines.join('\n')}
	return plan
}

function fallbackSuggestions(state: RepoStateType): AiContentType {
	const primary = state.unstaged.at(0) ?? state.staged.at(0)
	const hint = primary?.path ?? state.name

	return {
		commitMessages: [`Update ${hint}`, `Refine ${hint}`, `Polish ${state.name}`],
		branchNames: [
			`feature/${hint.replaceAll(path.sep, '-').replaceAll('.', '-')}`,
			`chore/${state.name}-tidy`,
			`bugfix/${state.name}`
		],
		pullRequest: {
			title: `Update ${state.name}`,
			body: `## Summary\n- Address changes in ${hint}\n\n## Notes\n- Generated automatically.`
		},
		plan: '- Review staged and unstaged changes\n- Finalize commit message\n- Push branch and open PR'
	}
}

export class RepoService extends Effect.Service<RepoService>()('@app/RepoService', {
	accessors: true,
	effect: Effect.gen(function* () {
		const readRoots = pipe(
			ensureConfigDir(),
			Effect.andThen(() =>
				readJson<string[]>(rootsFile, [os.homedir()]).pipe(Effect.tap(roots => writeJson(rootsFile, roots)))
			)
		)

		const writeRoots = (roots: readonly string[]) => writeJson(rootsFile, roots).pipe(Effect.as(roots))

		const listRepositories = Effect.gen(function* () {
			const roots = yield* readRoots
			const cache = yield* readJson<RepoCache>(repoCacheFile, {})

			const cached = cache[hashPath(roots.join('|'))]
			if (cached) return cached

			return yield* scanRepositories(roots)
		})

		function scanRoots(roots: readonly string[]) {
			return Effect.gen(function* () {
				const discovered: string[] = []

				for (const root of roots) {
					const stack: {dir: string; depth: number}[] = [{dir: root, depth: 0}]

					while (stack.length > 0) {
						const current = stack.pop()
						if (!current) continue
						if (current.depth > 4) continue

						const entries = yield* Effect.tryPromise({
							try: () => fs.readdir(current.dir, {withFileTypes: true}),
							catch: cause => (cause instanceof Error ? cause : new Error(`${cause}`))
						}).pipe(Effect.catchAll(() => Effect.succeed<Dirent[]>([])))
						if (entries.length === 0) continue

						const hasGit = entries.some(entry => entry.isDirectory() && entry.name === '.git')
						if (hasGit) {
							discovered.push(current.dir)
							continue
						}

						for (const entry of entries) {
							if (!entry.isDirectory()) continue
							if (entry.name.startsWith('.')) continue
							if (entry.name === 'node_modules') continue
							stack.push({dir: path.join(current.dir, entry.name), depth: current.depth + 1})
						}
					}
				}

				return discovered
			})
		}

		function repoBranch(repoPath: string) {
			return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
		}

		function repoStatus(repoPath: string) {
			return Effect.gen(function* () {
				const statusText = yield* runGit(['status', '--porcelain'], repoPath)
				const parsed = parseStatus(statusText)
				const branch = yield* repoBranch(repoPath)
				return repoState(repoPath, branch, parsed.staged, parsed.unstaged)
			})
		}

		function scanRepositories(roots: readonly string[]) {
			return Effect.gen(function* () {
				const repos = yield* scanRoots(roots)
				const summaries: RepoSummaryType[] = []

				for (const repo of repos) {
					const state = yield* repoStatus(repo)
					summaries.push(summarize(repo, state.branch, state.staged, state.unstaged))
				}

				const cacheKey = hashPath(roots.join('|'))
				const cache = yield* readJson<RepoCache>(repoCacheFile, {})
				cache[cacheKey] = summaries
				yield* ensureConfigDir()
				yield* writeJson(repoCacheFile, cache)

				return summaries
			})
		}

		function diffCommand(staged: boolean, filePath: string) {
			if (staged) return ['diff', '--cached', '--no-color', '--unified=3', '--', filePath]
			return ['diff', '--no-color', '--unified=3', '--', filePath]
		}

		function readDiff(repoPath: string, filePath: string, staged: boolean) {
			return Effect.gen(function* () {
				const status = yield* runGit(['status', '--porcelain', '--', filePath], repoPath)
				const isUntracked = status.startsWith('??')

				const args = staged
					? diffCommand(true, filePath)
					: isUntracked
						? ['diff', '--no-index', '--no-color', '--unified=3', '/dev/null', filePath]
						: diffCommand(false, filePath)

				const output = yield* runGit(args, repoPath)
				return parseDiff(repoPath, filePath, staged, output)
			})
		}

		function findHunk(diff: FileDiffType, hunkId: string) {
			return diff.hunks.find(item => item.id === hunkId)
		}

		function stageFile(repoPath: string, filePath: string) {
			return runGit(['add', filePath], repoPath)
		}

		function revertFile(repoPath: string, filePath: string, staged: boolean) {
			if (staged) return runGit(['reset', 'HEAD', '--', filePath], repoPath)
			return runGit(['checkout', '--', filePath], repoPath)
		}

		function stagePatch(repoPath: string, patch: string) {
			return applyPatch(repoPath, patch, true, false)
		}

		function revertPatch(repoPath: string, patch: string, staged: boolean) {
			return applyPatch(repoPath, patch, staged, true)
		}

		function stageTarget(repoPath: string, target: StageTargetType) {
			return Effect.gen(function* () {
				if (target.scope === 'file') {
					yield* stageFile(repoPath, target.filePath)
					return
				}

				const diff = yield* readDiff(repoPath, target.filePath, target.staged)
				const hunk = findHunk(diff, target.hunkId)
				if (!hunk) return

				if (target.scope === 'hunk') {
					const patch = buildHunkPatch(target.filePath, hunk)
					yield* stagePatch(repoPath, patch)
					return
				}

				const patch = buildRangePatch(target.filePath, hunk, target.start, target.end)
				yield* stagePatch(repoPath, patch)
			})
		}

		function revertTarget(repoPath: string, target: StageTargetType) {
			return Effect.gen(function* () {
				if (target.scope === 'file') {
					yield* revertFile(repoPath, target.filePath, target.staged)
					return
				}

				const diff = yield* readDiff(repoPath, target.filePath, target.staged)
				const hunk = findHunk(diff, target.hunkId)
				if (!hunk) return

				if (target.scope === 'hunk') {
					const patch = buildHunkPatch(target.filePath, hunk)
					yield* revertPatch(repoPath, patch, target.staged)
					return
				}

				const patch = buildRangePatch(target.filePath, hunk, target.start, target.end)
				yield* revertPatch(repoPath, patch, target.staged)
			})
		}

		function commentStore() {
			return Effect.gen(function* () {
				yield* ensureConfigDir()
				return yield* readJson<CommentStore>(commentsFile, {})
			})
		}

		function listComments(repoPath: string) {
			return Effect.gen(function* () {
				const store = yield* commentStore()
				return store[repoPath] ?? []
			})
		}

		function saveComment(repoPath: string, input: CommentInputType) {
			return Effect.gen(function* () {
				const store = yield* commentStore()
				const existing = store[repoPath] ?? []

				const comment: CommentType = {
					...input,
					id: randomUUID(),
					createdAt: Date.now()
				}

				store[repoPath] = [...existing, comment]
				yield* writeJson(commentsFile, store)
				return store[repoPath]
			})
		}

		function generateContent(state: RepoStateType, comments: CommentType[]) {
			const contextNotes = comments.map(comment => comment.text).slice(0, 3)

			const suggestions: AiContentType = {
				commitMessages: [
					...fallbackSuggestions(state).commitMessages,
					...contextNotes.map(note => `Address ${note}`)
				].slice(0, 3),
				branchNames: fallbackSuggestions(state).branchNames,
				pullRequest: fallbackSuggestions(state).pullRequest,
				plan: fallbackSuggestions(state).plan
			}

			return Effect.succeed(suggestions)
		}

		function exportPlan(repoPath: string) {
			return Effect.gen(function* () {
				const state = yield* repoStatus(repoPath)
				const comments = yield* listComments(repoPath)
				const suggestions = yield* generateContent(state, comments)
				return buildPlan(state, comments, suggestions)
			})
		}

		function createPullRequest(repoPath: string, title: string, body: string, branch: string) {
			return Effect.gen(function* () {
				const branchStatus = yield* runGit(['branch', '--show-current'], repoPath)
				if (branchStatus !== branch) {
					yield* runGit(['checkout', '-B', branch], repoPath)
				}

				const output = yield* runCli('gh', ['pr', 'create', '--title', title, '--body', body], repoPath).pipe(
					Effect.catchAll(error => Effect.succeed(error instanceof Error ? error.message : `${error}`))
				)

				const url = output.split('\n').find(line => line.includes('http'))

				return {output, url} satisfies PullRequestResultType
			})
		}

		return {
			listRoots: readRoots,
			addRoot: (root: string) =>
				readRoots.pipe(
					Effect.map(roots => [...new Set([...roots, root])]),
					Effect.tap(writeRoots)
				),
			removeRoot: (root: string) =>
				readRoots.pipe(
					Effect.map(roots => roots.filter(item => item !== root)),
					Effect.tap(writeRoots)
				),
			listRepositories,
			scanRepositories: readRoots.pipe(Effect.andThen(scanRepositories)),
			getRepository: repoStatus,
			getDiff: (repoPath: string, filePath: string, staged: boolean) => readDiff(repoPath, filePath, staged),
			stageTargets: (repoPath: string, targets: readonly StageTargetType[]) =>
				Effect.gen(function* () {
					for (const target of targets) {
						yield* stageTarget(repoPath, target)
					}
					return yield* repoStatus(repoPath)
				}),
			revertTargets: (repoPath: string, targets: readonly StageTargetType[]) =>
				Effect.gen(function* () {
					for (const target of targets) {
						yield* revertTarget(repoPath, target)
					}
					return yield* repoStatus(repoPath)
				}),
			listComments,
			saveComment,
			generateContent: (repoPath: string) =>
				Effect.gen(function* () {
					const state = yield* repoStatus(repoPath)
					const comments = yield* listComments(repoPath)
					return yield* generateContent(state, comments)
				}),
			exportPlan,
			createPullRequest
		}
	})
}) {}

export const RepoServiceLive = RepoService.Default
