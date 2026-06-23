import {Array, Equal, HashSet, Schema} from 'effect'

export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

type GitDiffStatus = typeof GitDiffStatus.Type
const GitDiffStatus = Schema.Literals(['added', 'deleted', 'modified', 'renamed'])

export type GitDiffSegment = typeof GitDiffSegment.Type
export const GitDiffSegment = Schema.Struct({
	filePath: Schema.String,
	fingerprint: Schema.String,
	id: Schema.String,
	type: Schema.Literals(['commit', 'worktree'])
})

export type GitDiff = typeof GitDiff.Type
export const GitDiff = Schema.Struct({
	fileContent: Schema.optional(Schema.String),
	filePath: Schema.String,
	patch: Schema.String,
	segments: Schema.Array(GitDiffSegment),
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
export const GitCommit = Schema.Struct({hash: Schema.String, shortHash: Schema.String, subject: Schema.String})

export type GitPullRequest = typeof GitPullRequest.Type
export const GitPullRequest = Schema.Struct({url: Schema.String})

export type GitReviewMetadata = typeof GitReviewMetadata.Type
export const GitReviewMetadata = Schema.Struct({
	branchCommits: Schema.Array(GitCommit),
	dirty: Schema.Boolean,
	localCommits: Schema.Array(GitCommit),
	prUrl: Schema.optional(Schema.String),
	unpushedCommits: Schema.Boolean,
	upstream: Schema.optional(Schema.Struct({ahead: Schema.Number, behind: Schema.Number}))
})

export type GitReviewMark = typeof GitReviewMark.Type
export const GitReviewMark = Schema.Struct({
	filePath: Schema.String,
	fingerprint: Schema.String,
	segmentId: Schema.String
})

export type GitReviewComment = typeof GitReviewComment.Type
export const GitReviewComment = Schema.Struct({
	body: Schema.String,
	filePath: Schema.String,
	lineNumber: Schema.Number,
	resolved: Schema.Boolean,
	side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
	source: Schema.optional(Schema.Literals(['local', 'github'])),
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
	return Array.map(diff.segments, segment =>
		GitReviewMark.make({filePath: segment.filePath, fingerprint: segment.fingerprint, segmentId: segment.id})
	)
}

export function gitReviewStateForMarks(segments: readonly GitReviewMark[], reviewed: HashSet.HashSet<GitReviewMark>) {
	const reviewedSegments = Array.filter(segments, segment => HashSet.has(reviewed, segment))

	if (Array.isReadonlyArrayEmpty(segments) || Array.isReadonlyArrayEmpty(reviewedSegments)) return 'unchecked' as const
	if (Array.length(reviewedSegments) === Array.length(segments)) return 'checked' as const

	return 'indeterminate' as const
}

export function gitReviewStateSaveComment(state: GitReviewState, comment: GitReviewComment) {
	return GitReviewState.make({
		comments: Array.append(
			Array.filter(
				state.comments,
				currentComment =>
					!Equal.equals(
						{
							filePath: currentComment.filePath,
							lineNumber: currentComment.lineNumber,
							side: currentComment.side ?? 'additions',
							source: currentComment.source ?? 'local',
							threadId: currentComment.threadId ?? ''
						},
						{
							filePath: comment.filePath,
							lineNumber: comment.lineNumber,
							side: comment.side ?? 'additions',
							source: comment.source ?? 'local',
							threadId: comment.threadId ?? ''
						}
					)
			),
			GitReviewComment.make({...comment, resolved: false, source: 'local', threadId: undefined, url: undefined})
		),
		marks: state.marks
	})
}

export function gitReviewStateResolveComment(
	state: GitReviewState,
	input: {readonly filePath: string; readonly lineNumber: number; readonly side?: 'additions' | 'deletions'}
) {
	return GitReviewState.make({
		comments: Array.map(state.comments, comment =>
			Equal.equals(
				{
					filePath: comment.filePath,
					lineNumber: comment.lineNumber,
					side: comment.side ?? 'additions',
					source: comment.source ?? 'local',
					threadId: comment.threadId ?? ''
				},
				{
					filePath: input.filePath,
					lineNumber: input.lineNumber,
					side: input.side ?? 'additions',
					source: 'local',
					threadId: ''
				}
			)
				? GitReviewComment.make({...comment, resolved: true})
				: comment
		),
		marks: state.marks
	})
}

export function gitReviewStateMark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	const reviewed = HashSet.fromIterable(marks)

	return GitReviewState.make({
		comments: state.comments,
		marks: Array.appendAll(
			Array.filter(state.marks, mark => !HashSet.has(reviewed, mark)),
			marks
		)
	})
}

export function gitReviewStateUnmark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	const reviewed = HashSet.fromIterable(marks)

	return GitReviewState.make({
		comments: state.comments,
		marks: Array.filter(state.marks, mark => !HashSet.has(reviewed, mark))
	})
}
