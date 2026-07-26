import {Array, Equal, HashSet, Predicate, Schema, pipe} from 'effect'
export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.optional(Schema.String)
}) {}
type GitDiffStatus = typeof GitDiffStatus.Type
const GitDiffStatus = Schema.Literals(['added', 'deleted', 'modified', 'renamed'])
export type GitDiff = typeof GitDiff.Type
export const GitDiff = Schema.Struct({
	changeHash: Schema.String,
	fileContent: Schema.optional(Schema.String),
	filePath: Schema.String,
	patch: Schema.optional(Schema.String),
	status: GitDiffStatus
})
export type GitReviewChangesTarget = typeof GitReviewChangesTarget.Type
export const GitReviewChangesTarget = Schema.TaggedStruct('changes', {})
export type GitReviewLocalTarget = typeof GitReviewLocalTarget.Type
export const GitReviewLocalTarget = Schema.TaggedStruct('local', {})
export type GitReviewBranchTarget = typeof GitReviewBranchTarget.Type
export const GitReviewBranchTarget = Schema.TaggedStruct('branch', {})
export type GitReviewCommitTarget = typeof GitReviewCommitTarget.Type
export const GitReviewCommitTarget = Schema.TaggedStruct('commit', {hash: Schema.String})
export type GitReviewTarget = typeof GitReviewTarget.Type
export const GitReviewTarget = Schema.Union([
	GitReviewChangesTarget,
	GitReviewLocalTarget,
	GitReviewBranchTarget,
	GitReviewCommitTarget
])
export type GitCommit = typeof GitCommit.Type
export const GitCommit = Schema.Struct({
	checkpoint: Schema.Boolean,
	hash: Schema.String,
	shortHash: Schema.String,
	subject: Schema.String
})
export type GitReviewMetadata = typeof GitReviewMetadata.Type
export const GitReviewMetadata = Schema.Struct({
	branchCommits: Schema.Array(GitCommit),
	dirty: Schema.Boolean,
	localCommits: Schema.Array(GitCommit),
	unpushedCommits: Schema.Boolean,
	upstream: Schema.optional(Schema.Struct({ahead: Schema.Finite, behind: Schema.Finite}))
})
export type GitReviewMark = typeof GitReviewMark.Type
export const GitReviewMark = Schema.Struct({changeHash: Schema.String, filePath: Schema.String})
export type GitReviewCommentDraft = typeof GitReviewCommentDraft.Type
export const GitReviewCommentDraft = Schema.Struct({
	body: Schema.String,
	filePath: Schema.String,
	lineNumber: Schema.Finite,
	side: Schema.optional(Schema.Literals(['additions', 'deletions']))
})
export type GitReviewComment = typeof GitReviewComment.Type
export const GitReviewComment = Schema.Struct({
	body: Schema.String,
	filePath: Schema.String,
	lineNumber: Schema.Finite,
	side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
	source: Schema.Literals(['local', 'github']),
	threadId: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String)
})
export type GitReviewState = typeof GitReviewState.Type
export const GitReviewState = Schema.Struct({
	comments: Schema.Array(GitReviewComment),
	marks: Schema.Array(GitReviewMark)
})
export type GitRepository = typeof GitRepository.Type
export const GitRepository = Schema.Struct({gitDirectory: Schema.String, root: Schema.String})
export type GitBranch = typeof GitBranch.Type
export const GitBranch = Schema.Struct({
	name: Schema.String,
	remote: Schema.optional(Schema.String),
	type: Schema.Literals(['local', 'remote'])
})
export type GitBranchesSnapshot = typeof GitBranchesSnapshot.Type
export const GitBranchesSnapshot = Schema.Struct({branches: Schema.Array(GitBranch), defaultBranch: Schema.String})
export type GitWorktreeLocalSource = typeof GitWorktreeLocalSource.Type
export const GitWorktreeLocalSource = Schema.TaggedStruct('local', {})
export type GitWorktreeRemoteSource = typeof GitWorktreeRemoteSource.Type
export const GitWorktreeRemoteSource = Schema.TaggedStruct('remote', {remote: Schema.String})
export type GitWorktreeNewSource = typeof GitWorktreeNewSource.Type
export const GitWorktreeNewSource = Schema.TaggedStruct('new', {})
export type GitWorktreeSource = typeof GitWorktreeSource.Type
export const GitWorktreeSource = Schema.Union([GitWorktreeLocalSource, GitWorktreeRemoteSource, GitWorktreeNewSource])
export type GitWorktree = typeof GitWorktree.Type
export const GitWorktree = Schema.Struct({branch: Schema.optional(Schema.String), root: Schema.String})
export type GitProject = typeof GitProject.Type
export const GitProject = Schema.Struct({repository: GitRepository, worktrees: Schema.Array(GitWorktree)})
export function gitReviewMarksForDiff(diff: GitDiff) {
	return [GitReviewMark.make({changeHash: diff.changeHash, filePath: diff.filePath})]
}
export function gitReviewStateForMarks(input: {
	readonly marks: readonly GitReviewMark[]
	readonly reviewed: HashSet.HashSet<GitReviewMark>
}) {
	if (Array.isReadonlyArrayEmpty(input.marks)) return 'unchecked' as const
	const reviewedMarks = Array.filter(input.marks, mark => HashSet.has(input.reviewed, mark))
	if (Array.isReadonlyArrayEmpty(reviewedMarks)) return 'unchecked' as const
	if (Array.length(reviewedMarks) === Array.length(input.marks)) return 'checked' as const
	return 'indeterminate' as const
}
export function gitReviewStateSaveComment(input: {
	readonly draft: GitReviewCommentDraft
	readonly state: GitReviewState
}) {
	const comment = GitReviewComment.make({...input.draft, source: 'local'})
	return GitReviewState.make({
		comments: Array.append(
			Array.filter(
				input.state.comments,
				currentComment => !sameCommentIdentity({left: currentComment, right: comment})
			),
			comment
		),
		marks: input.state.marks
	})
}
export function gitReviewStateDeleteComments(input: {
	readonly comments: readonly GitReviewComment[]
	readonly state: GitReviewState
}) {
	const deletedThreadIds = pipe(
		input.comments,
		Array.filter(comment => comment.source === 'github' && Predicate.isString(comment.threadId)),
		Array.map(comment => comment.threadId ?? ''),
		HashSet.fromIterable
	)
	return GitReviewState.make({
		comments: Array.filter(input.state.comments, comment =>
			comment.source === 'github' && HashSet.has(deletedThreadIds, comment.threadId ?? '')
				? false
				: Array.every(input.comments, deletedComment => !sameCommentIdentity({left: comment, right: deletedComment}))
		),
		marks: input.state.marks
	})
}
export function gitReviewStateMark(input: {readonly marks: readonly GitReviewMark[]; readonly state: GitReviewState}) {
	const reviewed = HashSet.fromIterable(input.marks)
	return GitReviewState.make({
		comments: input.state.comments,
		marks: Array.appendAll(
			Array.filter(input.state.marks, mark => !HashSet.has(reviewed, mark)),
			input.marks
		)
	})
}
export function gitReviewStateUnmark(input: {
	readonly marks: readonly GitReviewMark[]
	readonly state: GitReviewState
}) {
	const reviewed = HashSet.fromIterable(input.marks)
	return GitReviewState.make({
		comments: input.state.comments,
		marks: Array.filter(input.state.marks, mark => !HashSet.has(reviewed, mark))
	})
}
function sameCommentIdentity(input: {readonly left: GitReviewComment; readonly right: GitReviewComment}) {
	return Equal.equals(
		{
			filePath: input.left.filePath,
			lineNumber: input.left.lineNumber,
			side: input.left.side ?? 'additions',
			source: input.left.source,
			threadId: input.left.threadId ?? ''
		},
		{
			filePath: input.right.filePath,
			lineNumber: input.right.lineNumber,
			side: input.right.side ?? 'additions',
			source: input.right.source,
			threadId: input.right.threadId ?? ''
		}
	)
}
