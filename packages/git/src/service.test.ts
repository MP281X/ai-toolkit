import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Array, Context, Effect, String, pipe} from 'effect'

import {afterEach, describe, expect, it} from 'vite-plus/test'

import {
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

		expect(Array.map(entries.filtered, entry => entry.filePath)).toEqual(['keep.ts'])
		expect(Array.map(entries.unfiltered, entry => entry.filePath)).toEqual(['drop.ts', 'keep.ts', 'plans/review.md'])
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
