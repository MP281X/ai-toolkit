import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Array, Context, Effect, String, SubscriptionRef, pipe} from 'effect'

import {afterEach, describe, expect, it} from 'vite-plus/test'

import {GitReviewChangesTarget, GitReviewCommitTarget, GitReviewMark} from './schema.ts'
import {GitChanges, GitPublish, GitReview} from './service.ts'

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

function runChanges<A>(cwd: string, effect: Effect.Effect<A, unknown, GitChanges>) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(effect, Effect.provide(GitChanges.layer({cwd})), Effect.provide(NodeServices.layer))
	)
}

function runReview<A>(cwd: string, effect: Effect.Effect<A, unknown, GitReview>) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(effect, Effect.provide(GitReview.layer({cwd})), Effect.provide(NodeServices.layer))
	)
}

function runPublish<A>(cwd: string, effect: Effect.Effect<A, unknown, GitPublish>) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(effect, Effect.provide(GitPublish.layer({cwd})), Effect.provide(NodeServices.layer))
	)
}

function changesDiffs(cwd: string) {
	return runChanges(
		cwd,
		Effect.gen(function* () {
			const changes = yield* GitChanges
			const ref = yield* changes.diffs(GitReviewChangesTarget.make({}))
			return yield* SubscriptionRef.get(ref)
		})
	)
}

afterEach(() => {
	for (const cwd of repositories.splice(0)) {
		rmSync(cwd, {force: true, recursive: true})
	}
})

describe('GitChanges', () => {
	it('returns one combined ready diff snapshot for working changes', async () => {
		const cwd = repository()
		write(cwd, 'staged.txt', 'base\n')
		write(cwd, 'unstaged.txt', 'base\n')
		commit(cwd, 'base')

		write(cwd, 'staged.txt', 'staged\n')
		git(cwd, ['add', 'staged.txt'])
		write(cwd, 'unstaged.txt', 'unstaged\n')
		write(cwd, 'new.txt', 'new\n')

		const diffs = await changesDiffs(cwd)

		expect(Array.map(diffs, diff => diff.filePath)).toEqual(['staged.txt', 'unstaged.txt', 'new.txt'])
		expect(Array.every(diffs, diff => String.isString(diff.patch) && String.isString(diff.fileContent))).toBe(true)
	}, 10_000)

	it('excludes ignored review files from the ready snapshot', async () => {
		const cwd = repository()
		write(cwd, 'keep.ts', 'base\n')
		write(cwd, 'plans/review.md', 'base\n')
		commit(cwd, 'base')

		write(cwd, 'keep.ts', 'changed\n')
		write(cwd, 'plans/review.md', 'changed\n')

		const diffs = await changesDiffs(cwd)

		expect(Array.map(diffs, diff => diff.filePath)).toEqual(['keep.ts'])
	}, 10_000)

	it('updates untracked change hashes when same-size content changes', async () => {
		const cwd = repository()
		write(cwd, 'tracked.txt', 'base\n')
		commit(cwd, 'base')
		write(cwd, 'new.txt', 'ab\n')

		const first = await changesDiffs(cwd)
		write(cwd, 'new.txt', 'cd\n')
		const second = await changesDiffs(cwd)

		expect(first[0]?.patch).toContain('+ab')
		expect(second[0]?.patch).toContain('+cd')
		expect(first[0]?.changeHash).not.toBe(second[0]?.changeHash)
	}, 10_000)

	it('includes full file content and rename patch data', async () => {
		const cwd = repository()
		write(cwd, 'old.txt', 'content\n')
		commit(cwd, 'base')
		git(cwd, ['mv', 'old.txt', 'new.txt'])

		const diffs = await changesDiffs(cwd)

		expect(diffs[0]?.status).toBe('renamed')
		expect(diffs[0]?.fileContent).toBe('content\n')
		expect(diffs[0]?.patch).toContain('rename from old.txt')
		expect(diffs[0]?.patch).toContain('rename to new.txt')
	}, 10_000)

	it('includes patch revisions for commit targets', async () => {
		const cwd = repository()
		write(cwd, 'changed.txt', 'base\n')
		commit(cwd, 'base')
		write(cwd, 'changed.txt', 'changed\n')
		const changed = commit(cwd, 'changed')

		const diffs = await runChanges(
			cwd,
			Effect.gen(function* () {
				const changes = yield* GitChanges
				const ref = yield* changes.diffs(GitReviewCommitTarget.make({hash: changed}))
				return yield* SubscriptionRef.get(ref)
			})
		)

		expect(diffs[0]?.patch).toContain('-base')
		expect(diffs[0]?.patch).toContain('+changed')
		expect(diffs[0]?.fileContent).toBe('changed\n')
	}, 10_000)

	it('filters whitespace-only diffs', async () => {
		const cwd = repository()
		write(cwd, 'space.txt', 'const value = 1\n')
		commit(cwd, 'base')
		write(cwd, 'space.txt', 'const   value   =   1\n')

		expect(await changesDiffs(cwd)).toEqual([])
	}, 10_000)

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

		const diffs = await runChanges(
			cwd,
			Effect.gen(function* () {
				const changes = yield* GitChanges
				const ref = yield* changes.diffs(GitReviewCommitTarget.make({hash: merge}))
				return yield* SubscriptionRef.get(ref)
			})
		)

		expect(Array.map(diffs, diff => diff.filePath)).toEqual(['conflict.txt'])
	}, 10_000)
})

describe('GitReview', () => {
	it('keeps only live local comments and marks', async () => {
		const cwd = repository()
		const mark = GitReviewMark.make({changeHash: 'hash', filePath: 'keep.ts'})

		const state = await runReview(
			cwd,
			Effect.gen(function* () {
				const review = yield* GitReview
				yield* review.saveComment({body: 'check this', filePath: 'keep.ts', lineNumber: 1})
				const current = yield* SubscriptionRef.get(review.state)
				yield* review.resolveComments(current.comments)
				yield* review.mark([mark])
				return yield* SubscriptionRef.get(review.state)
			})
		)

		expect(state.comments).toEqual([])
		expect(state.marks).toEqual([mark])
	}, 10_000)
})

describe('GitPublish', () => {
	it('squashes contiguous head checkpoints into the publish commit', async () => {
		const cwd = repository()
		write(cwd, 'file.txt', 'base\n')
		commit(cwd, 'base')

		write(cwd, 'file.txt', 'one\n')
		await runPublish(
			cwd,
			Effect.gen(function* () {
				const publish = yield* GitPublish
				yield* publish.checkpoint
			})
		)
		write(cwd, 'file.txt', 'two\n')
		await runPublish(
			cwd,
			Effect.gen(function* () {
				const publish = yield* GitPublish
				yield* publish.checkpoint
			})
		)

		await runPublish(
			cwd,
			Effect.gen(function* () {
				const publish = yield* GitPublish
				return yield* publish.publish({message: 'Final title\n\nFinal body'})
			})
		)

		expect(String.trim(git(cwd, ['log', '--format=%s', '--max-count=1']))).toBe('Final title')
		expect(git(cwd, ['log', '--format=%s', '--max-count=3'])).not.toContain('checkpoint')
		expect(String.trim(git(cwd, ['show', '--format=', '--name-only', 'HEAD']))).toBe('file.txt')
	}, 10_000)
})
