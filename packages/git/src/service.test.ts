import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Array, Context, Effect, String, pipe} from 'effect'

import {afterEach, describe, expect, it} from 'vite-plus/test'

import {
	GitReviewComment,
	GitReviewMark,
	GitReviewStagedTarget,
	GitReviewUnstagedTarget,
	GitReviewChangesTarget,
	GitReviewCommitTarget
} from './schema.ts'
import {GitReview} from './service.ts'

const repositories = Array.empty<string>()

function git(cwd: string, args: readonly string[]) {
	return execFileSync('git', args, {cwd, encoding: 'utf8'})
}

function write(cwd: string, filePath: string, content: string) {
	mkdirSync(join(cwd, filePath, '..'), {recursive: true})
	writeFileSync(join(cwd, filePath), content)
}

function repository() {
	const cwd = mkdtempSync(join(tmpdir(), 'deslop-git-review-'))
	repositories.push(cwd)
	git(cwd, ['init', '--initial-branch=main'])
	git(cwd, ['config', 'user.email', 'test@example.com'])
	git(cwd, ['config', 'user.name', 'Test User'])
	return cwd
}

function commit(cwd: string, subject: string) {
	git(cwd, ['add', '.'])
	git(cwd, ['commit', '-m', subject])
	return pipe(git(cwd, ['rev-parse', 'HEAD']), String.trim)
}

function reviewEffect<A>(cwd: string, effect: Effect.Effect<A, unknown, GitReview>) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(effect, Effect.provide(GitReview.layer({cwd})), Effect.provide(NodeServices.layer))
	)
}

afterEach(() => {
	for (const cwd of repositories.splice(0)) {
		rmSync(cwd, {force: true, recursive: true})
	}
})

describe('GitReview', () => {
	it('splits staged and unstaged working changes', async () => {
		const cwd = repository()
		write(cwd, 'staged.txt', 'base\n')
		write(cwd, 'unstaged.txt', 'base\n')
		commit(cwd, 'base')

		write(cwd, 'staged.txt', 'staged\n')
		git(cwd, ['add', 'staged.txt'])
		write(cwd, 'unstaged.txt', 'unstaged\n')
		write(cwd, 'new.txt', 'new\n')

		const staged = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileEntries({target: GitReviewStagedTarget.make({}), viewMode: 'filtered'})
			})
		)
		const unstaged = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileEntries({target: GitReviewUnstagedTarget.make({}), viewMode: 'filtered'})
			})
		)

		expect(Array.map(staged, entry => entry.filePath)).toEqual(['staged.txt'])
		expect(Array.map(unstaged, entry => entry.filePath)).toEqual(['new.txt', 'unstaged.txt'])
	})

	it('applies review exclusions only in filtered mode', async () => {
		const cwd = repository()
		write(cwd, 'keep.ts', 'base\n')
		write(cwd, 'drop.ts', 'base\n')
		write(cwd, 'plans/review.md', 'base\n')
		commit(cwd, 'base')

		write(cwd, 'keep.ts', 'changed\n')
		write(cwd, 'plans/review.md', 'changed\n')
		git(cwd, ['rm', 'drop.ts'])

		const entries = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				const filtered = yield* review.reviewFileEntries({
					target: GitReviewChangesTarget.make({}),
					viewMode: 'filtered'
				})
				const unfiltered = yield* review.reviewFileEntries({
					target: GitReviewChangesTarget.make({}),
					viewMode: 'unfiltered'
				})
				return {filtered, unfiltered}
			})
		)

		expect(Array.map(entries.filtered, entry => entry.filePath)).toEqual(['drop.ts', 'keep.ts'])
		expect(Array.map(entries.unfiltered, entry => entry.filePath)).toEqual(['drop.ts', 'keep.ts', 'plans/review.md'])
	})

	it('updates untracked entry revisions when same-size content changes', async () => {
		const cwd = repository()
		write(cwd, 'tracked.txt', 'base\n')
		commit(cwd, 'base')
		write(cwd, 'new.txt', 'ab\n')

		const first = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileEntries({target: GitReviewChangesTarget.make({}), viewMode: 'filtered'})
			})
		)
		write(cwd, 'new.txt', 'cd\n')
		const second = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileEntries({target: GitReviewChangesTarget.make({}), viewMode: 'filtered'})
			})
		)

		expect(first[0]?.revision).toContain('+ab')
		expect(second[0]?.revision).toContain('+cd')
		expect(first[0]?.revision).not.toBe(second[0]?.revision)
	})

	it('preserves staged rename patches when loading one file', async () => {
		const cwd = repository()
		write(cwd, 'old.txt', 'content\n')
		commit(cwd, 'base')
		git(cwd, ['mv', 'old.txt', 'new.txt'])

		const content = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileContent({
					filePath: 'new.txt',
					target: GitReviewStagedTarget.make({}),
					viewMode: 'filtered'
				})
			})
		)

		expect(content.status).toBe('renamed')
		expect(content.patch).toContain('rename from old.txt')
		expect(content.patch).toContain('rename to new.txt')
	})

	it('rejects file content for ignored files outside review entries', async () => {
		const cwd = repository()
		write(cwd, '.gitignore', '.env\n')
		commit(cwd, 'base')
		write(cwd, '.env', 'SECRET=value\n')

		await expect(
			reviewEffect(
				cwd,
				Effect.gen(function* () {
					const review = yield* GitReview
					return yield* review.reviewFileContent({
						filePath: '.env',
						target: GitReviewChangesTarget.make({}),
						viewMode: 'unfiltered'
					})
				})
			)
		).rejects.toThrow('File is not part of the current review.')
	})

	it('shows excluded review state only in unfiltered mode', async () => {
		const cwd = repository()
		const comment = GitReviewComment.make({
			body: 'check lockfile',
			filePath: 'pnpm-lock.yaml',
			lineNumber: 1,
			resolved: false
		})
		const mark = GitReviewMark.make({filePath: 'pnpm-lock.yaml', fingerprint: 'patch', segmentId: 'HEAD->worktree'})

		const states = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				yield* review.saveComment(comment)
				yield* review.mark([mark])
				const filtered = yield* review.reviewState('filtered')
				const unfiltered = yield* review.reviewState('unfiltered')
				return {filtered, unfiltered}
			})
		)

		expect(states.filtered.comments).toHaveLength(0)
		expect(states.filtered.marks).toHaveLength(0)
		expect(Array.map(states.unfiltered.comments, current => current.filePath)).toEqual(['pnpm-lock.yaml'])
		expect(Array.map(states.unfiltered.marks, current => current.filePath)).toEqual(['pnpm-lock.yaml'])
	})

	it('lists unchanged tracked and untracked files in unfiltered mode and loads unchanged content without a patch', async () => {
		const cwd = repository()
		write(cwd, '.gitignore', 'ignored.txt\n')
		write(cwd, 'unchanged.txt', 'unchanged\n')
		commit(cwd, 'base')
		write(cwd, 'new.txt', 'new\n')
		write(cwd, 'ignored.txt', 'ignored\n')

		const result = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				const entries = yield* review.reviewFileEntries({
					target: GitReviewChangesTarget.make({}),
					viewMode: 'unfiltered'
				})
				const content = yield* review.reviewFileContent({
					filePath: 'unchanged.txt',
					target: GitReviewChangesTarget.make({}),
					viewMode: 'unfiltered'
				})
				return {content, entries}
			})
		)

		expect(Array.map(result.entries, entry => entry.filePath)).toEqual(['.gitignore', 'new.txt', 'unchanged.txt'])
		expect(result.content.fileContent).toBe('unchanged\n')
		expect(result.content.patch).toBeUndefined()
	})

	it('shows only merge resolution diffs for merge commits', async () => {
		const cwd = repository()
		write(cwd, 'conflict.txt', 'base\n')
		write(cwd, 'clean.txt', 'base\n')
		commit(cwd, 'base')

		git(cwd, ['checkout', '-b', 'feature'])
		write(cwd, 'conflict.txt', 'feature\n')
		write(cwd, 'clean.txt', 'feature clean\n')
		commit(cwd, 'feature')

		git(cwd, ['checkout', 'main'])
		write(cwd, 'conflict.txt', 'main\n')
		commit(cwd, 'main')
		try {
			git(cwd, ['merge', 'feature'])
		} catch {
			write(cwd, 'conflict.txt', 'resolved\n')
			git(cwd, ['add', 'conflict.txt'])
			git(cwd, ['commit', '-m', 'merge feature'])
		}
		const merge = pipe(git(cwd, ['rev-parse', 'HEAD']), String.trim)

		const entries = await reviewEffect(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				return yield* review.reviewFileEntries({
					target: GitReviewCommitTarget.make({hash: merge}),
					viewMode: 'filtered'
				})
			})
		)

		expect(Array.map(entries, entry => entry.filePath)).toEqual(['conflict.txt'])
	})
})
