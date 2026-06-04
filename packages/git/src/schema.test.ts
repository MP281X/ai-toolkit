import {Array} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {
	GitDiff,
	GitDiffSegment,
	GitReviewComment,
	GitReviewState,
	gitReviewMarkKey,
	gitReviewMarksForDiff,
	gitReviewStateForMarks,
	gitReviewStateMark,
	gitReviewStateResolveComment,
	gitReviewStateSaveComment
} from './schema.ts'

describe('@deslop/git review state', () => {
	it('marks local comments resolved without deleting them', () => {
		const saved = gitReviewStateSaveComment(
			new GitReviewState({comments: Array.empty(), marks: Array.empty()}),
			new GitReviewComment({
				body: 'fix this',
				filePath: 'src/file.ts',
				lineNumber: 12,
				resolved: false,
				side: 'additions'
			})
		)
		const resolved = gitReviewStateResolveComment(saved, {filePath: 'src/file.ts', lineNumber: 12, side: 'additions'})

		expect(resolved.comments).toHaveLength(1)
		expect(resolved.comments[0]?.body).toBe('fix this')
		expect(resolved.comments[0]?.resolved).toBe(true)
	})

	it('invalidates reviewed state when a diff fingerprint changes', () => {
		const firstMarks = gitReviewMarksForDiff(
			new GitDiff({
				filePath: 'src/file.ts',
				patch: 'first',
				segments: [
					new GitDiffSegment({filePath: 'src/file.ts', fingerprint: 'first', id: 'HEAD->worktree', type: 'worktree'})
				],
				status: 'modified'
			})
		)
		const secondMarks = gitReviewMarksForDiff(
			new GitDiff({
				filePath: 'src/file.ts',
				patch: 'second',
				segments: [
					new GitDiffSegment({filePath: 'src/file.ts', fingerprint: 'second', id: 'HEAD->worktree', type: 'worktree'})
				],
				status: 'modified'
			})
		)
		const reviewed = gitReviewStateMark(new GitReviewState({comments: Array.empty(), marks: Array.empty()}), firstMarks)
		const reviewedKeys = new Set(Array.map(reviewed.marks, gitReviewMarkKey))

		expect(gitReviewStateForMarks(firstMarks, reviewedKeys)).toBe('checked')
		expect(gitReviewStateForMarks(secondMarks, reviewedKeys)).toBe('unchecked')
	})
})
