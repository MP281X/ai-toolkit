import {Effect, Option, Schema, pipe} from 'effect'

import * as Num from 'effect/Number'

import {
	DiffFile,
	DiffHunk,
	type DiffLine,
	DiffLineAdd,
	type DiffLineAddType,
	DiffLineContext,
	type DiffLineDelType,
	DiffLineDel,
	type DiffQuery,
	type RepoPath,
	RepoStatus,
	StageSelection
} from './schema.ts'

export class GitError extends Schema.TaggedError<GitError>()('GitError', {
	command: Schema.String,
	stderr: Schema.String
}) {}

function parseStatus(stdout: string) {
	let branch: string | undefined
	let ahead = 0
	let behind = 0
	const staged: string[] = []
	const unstaged: string[] = []
	const untracked: string[] = []

	for (const line of stdout.split('\n')) {
		if (line.startsWith('# branch.head')) {
			branch = line.replace('# branch.head ', '').trim()
			continue
		}
		if (line.startsWith('# branch.ab')) {
			const parts = line.replace('# branch.ab ', '').trim().split(' ')
			const aheadPart = parts.at(0)
			const behindPart = parts.at(1)
			if (aheadPart)
				ahead = pipe(
					aheadPart.replace('+', ''),
					Num.parse,
					Option.getOrElse(() => 0)
				)
			if (behindPart)
				behind = pipe(
					behindPart.replace('-', ''),
					Num.parse,
					Option.getOrElse(() => 0)
				)
			continue
		}

		if (line.startsWith('? ')) {
			untracked.push(line.slice(2))
			continue
		}

		if (line.startsWith('1 ') || line.startsWith('2 ')) {
			const segments = line.split(' ')
			const status = segments[1]
			if (!status) continue
			const path = segments.at(-1)
			if (!path) continue

			const stagedCode = status[0]
			const worktreeCode = status[1]

			if (stagedCode !== '.') staged.push(path)
			if (worktreeCode !== '.') unstaged.push(path)
		}
	}

	return RepoStatus.make({branch, ahead, behind, staged, unstaged, untracked})
}

function parseDiff(output: string) {
	const files: DiffFile[] = []
	let path: string | undefined
	let oldPath: string | undefined
	let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified'
	let isBinary = false
	let hunks: DiffHunk[] = []
	let currentHunk: DiffHunk | undefined
	let oldLine = 0
	let newLine = 0

	const pushHunk = () => {
		if (!currentHunk) return
		hunks = [...hunks, currentHunk]
		currentHunk = undefined
	}

	const pushFile = () => {
		if (!path) return
		pushHunk()
		files.push(
			DiffFile.make({
				path,
				oldPath,
				status,
				isBinary,
				hunks
			})
		)
		path = undefined
		oldPath = undefined
		status = 'modified'
		isBinary = false
		hunks = []
	}

	for (const line of output.split('\n')) {
		if (line.startsWith('diff --git ')) {
			pushFile()
			const [, , aPath, bPath] = line.split(' ')
			oldPath = aPath?.replace('a/', '') ?? ''
			path = bPath?.replace('b/', '') ?? oldPath
			continue
		}

		if (line.startsWith('new file mode')) {
			status = 'added'
			continue
		}

		if (line.startsWith('deleted file mode')) {
			status = 'deleted'
			continue
		}

		if (line.startsWith('rename from')) {
			oldPath = line.replace('rename from ', '')
			continue
		}

		if (line.startsWith('rename to')) {
			path = line.replace('rename to ', '')
			status = 'renamed'
			continue
		}

		if (line.startsWith('Binary files')) {
			isBinary = true
			continue
		}

		if (line.startsWith('@@')) {
			pushHunk()
			const match = /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/.exec(line)
			if (!match) continue

			oldLine = pipe(
				match[1] ?? '0',
				Num.parse,
				Option.getOrElse(() => 0)
			)
			newLine = pipe(
				match[3] ?? '0',
				Num.parse,
				Option.getOrElse(() => 0)
			)
			const oldLines = pipe(
				match[2] || '0',
				Num.parse,
				Option.getOrElse(() => 0)
			)
			const newLines = pipe(
				match[4] || '0',
				Num.parse,
				Option.getOrElse(() => 0)
			)
			const header = match[5]?.trim() ?? ''

			currentHunk = DiffHunk.make({
				id: `${path ?? ''}:${oldLine}:${newLine}:${hunks.length}`,
				oldStart: oldLine,
				oldLines,
				newStart: newLine,
				newLines,
				header,
				lines: []
			})
			continue
		}

		if (!currentHunk) continue

		if (line.startsWith('+')) {
			currentHunk = DiffHunk.make({
				...currentHunk,
				lines: [...currentHunk.lines, DiffLineAdd.make({text: line.slice(1), newLine})]
			})
			newLine += 1
			continue
		}

		if (line.startsWith('-')) {
			currentHunk = DiffHunk.make({
				...currentHunk,
				lines: [...currentHunk.lines, DiffLineDel.make({text: line.slice(1), oldLine})]
			})
			oldLine += 1
			continue
		}

		if (line.startsWith('\\')) continue

		currentHunk = DiffHunk.make({
			...currentHunk,
			lines: [...currentHunk.lines, DiffLineContext.make({text: line.slice(1), oldLine, newLine})]
		})
		oldLine += 1
		newLine += 1
	}

	pushFile()
	return files
}

function buildPatch(file: DiffFile, lines: readonly DiffLine[]) {
	const filtered = lines.filter((line): line is DiffLineAddType | DiffLineDelType => line._tag !== 'context')
	if (filtered.length === 0) return Option.none<string>()

	const firstOld = filtered.find(line => line._tag !== 'add')?.oldLine ?? 0
	const firstNew = filtered.find(line => line._tag !== 'del')?.newLine ?? 0

	const oldCount = filtered.filter(line => line._tag !== 'add').length
	const newCount = filtered.filter(line => line._tag !== 'del').length

	const headerOld = file.status === 'added' ? '/dev/null' : `a/${file.oldPath ?? file.path}`
	const headerNew = file.status === 'deleted' ? '/dev/null' : `b/${file.path}`

	const body = filtered.map(line => (line._tag === 'add' ? `+${line.text}` : `-${line.text}`)).join('\n')

	const patch = [
		`diff --git ${headerOld} ${headerNew}`,
		`--- ${headerOld}`,
		`+++ ${headerNew}`,
		`@@ -${firstOld},${oldCount} +${firstNew},${newCount} @@`,
		body,
		''
	].join('\n')

	return Option.some(patch)
}

function runGit(repoPath: RepoPath, args: readonly string[], stdin?: string) {
	return Effect.tryPromise({
		try: async () => {
			const proc = Bun.spawn(['git', ...args], {
				cwd: repoPath,
				stdin: stdin ? 'pipe' : 'inherit',
				stdout: 'pipe',
				stderr: 'pipe'
			})

			if (stdin) {
				proc.stdin?.write(stdin)
				await proc.stdin?.flush()
				proc.stdin?.end()
			}

			const [exitCode, stdout, stderr] = await Promise.all([
				proc.exited,
				proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(''),
				proc.stderr ? new Response(proc.stderr).text() : Promise.resolve('')
			])

			if (exitCode !== 0) throw GitError.make({command: args.join(' '), stderr})
			return {stdout, stderr}
		},
		catch: cause => GitError.make({command: args.join(' '), stderr: `${cause}`})
	})
}

export class GitService extends Effect.Service<GitService>()('@ai-toolkit/git/GitService', {
	accessors: true,
	effect: Effect.gen(function* () {
		return {
			status: Effect.fnUntraced(function* (repoPath: RepoPath) {
				const {stdout} = yield* runGit(repoPath, ['status', '--porcelain=v2', '--branch'])
				return parseStatus(stdout)
			}),

			diff: Effect.fnUntraced(function* (query: DiffQuery) {
				const args =
					query.source === 'staged'
						? ['diff', '--cached', '--no-color', '--unified=3', '--no-ext-diff']
						: ['diff', '--no-color', '--unified=3', '--no-ext-diff']
				const {stdout} = yield* runGit(query.repoPath, args)
				return parseDiff(stdout)
			}),

			stage: Effect.fnUntraced(function* (selection: StageSelection, diff?: DiffFile[]) {
				if (selection.kind === 'file') {
					const args = selection.reverse ? ['restore', '--staged', selection.path] : ['add', selection.path]
					yield* runGit(selection.repoPath, args)
					return
				}

				if (selection.kind === 'directory') {
					const args = selection.reverse ? ['restore', '--staged', selection.path] : ['add', selection.path]
					yield* runGit(selection.repoPath, args)
					return
				}

				const targetFile = diff?.find(file => file.path === selection.path)
				const targetHunk = targetFile?.hunks.find(hunk => hunk.id === selection.hunkId)

				const lines =
					selection.kind === 'hunk'
						? (targetHunk?.lines ?? [])
						: (targetHunk?.lines.filter(line => {
								const matchesOld =
									'oldLine' in line && selection.oldLine !== undefined ? line.oldLine === selection.oldLine : false
								const matchesNew =
									'newLine' in line && selection.newLine !== undefined ? line.newLine === selection.newLine : false
								return matchesOld || matchesNew
							}) ?? [])

				const patchValue =
					selection.patch ?? (targetFile ? Option.getOrElse(buildPatch(targetFile, lines), () => undefined) : undefined)
				if (!patchValue) return

				const args = selection.reverse ? ['apply', '--cached', '--reverse'] : ['apply', '--cached']
				yield* runGit(selection.repoPath, args, patchValue)
			}),

			raw: Effect.fnUntraced(function* (input: {repoPath: RepoPath; args: readonly string[]; stdin?: string}) {
				const {stdout} = yield* runGit(input.repoPath, input.args, input.stdin)
				return stdout
			})
		}
	})
}) {}
