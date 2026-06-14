import {Array, Schema} from 'effect'

export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type GitDiffStatus = typeof GitDiffStatus.Type
export const GitDiffStatus = Schema.Literals(['added', 'deleted', 'modified', 'renamed'])

export class GitDiffSegment extends Schema.Class<GitDiffSegment>('GitDiffSegment')({
	filePath: Schema.String,
	fingerprint: Schema.String,
	id: Schema.String,
	type: Schema.Literals(['commit', 'worktree'])
}) {}

export class GitDiff extends Schema.Class<GitDiff>('GitDiff')({
	fileContent: Schema.optional(Schema.String),
	filePath: Schema.String,
	patch: Schema.String,
	segments: Schema.Array(GitDiffSegment),
	status: GitDiffStatus
}) {}

export type GitReviewTarget = typeof GitReviewTarget.Type
export const GitReviewTarget = Schema.Union([
	Schema.Struct({_tag: Schema.Literal('changes')}),
	Schema.Struct({_tag: Schema.Literal('local')}),
	Schema.Struct({_tag: Schema.Literal('branch')}),
	Schema.Struct({_tag: Schema.Literal('commit'), hash: Schema.String})
])

export class GitCommit extends Schema.Class<GitCommit>('GitCommit')({
	hash: Schema.String,
	shortHash: Schema.String,
	subject: Schema.String
}) {}

export class GitPullRequest extends Schema.Class<GitPullRequest>('GitPullRequest')({url: Schema.String}) {}

export class GitReviewMetadata extends Schema.Class<GitReviewMetadata>('GitReviewMetadata')({
	branchCommits: Schema.Array(GitCommit),
	dirty: Schema.Boolean,
	localCommits: Schema.Array(GitCommit),
	prUrl: Schema.optional(Schema.String),
	unpushedCommits: Schema.Boolean,
	upstream: Schema.optional(Schema.Struct({ahead: Schema.Number, behind: Schema.Number}))
}) {}

export class GitReviewMark extends Schema.Class<GitReviewMark>('GitReviewMark')({
	filePath: Schema.String,
	fingerprint: Schema.String,
	segmentId: Schema.String
}) {}

export class GitReviewComment extends Schema.Class<GitReviewComment>('GitReviewComment')({
	body: Schema.String,
	filePath: Schema.String,
	lineNumber: Schema.Number,
	resolved: Schema.Boolean,
	side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
	source: Schema.optional(Schema.Literals(['local', 'github'])),
	threadId: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String)
}) {}

export class GitReviewState extends Schema.Class<GitReviewState>('GitReviewState')({
	comments: Schema.Array(GitReviewComment),
	marks: Schema.Array(GitReviewMark)
}) {}

export class GitRepository extends Schema.Class<GitRepository>('GitRepository')({
	gitDirectory: Schema.String,
	root: Schema.String
}) {}

export class GitBranch extends Schema.Class<GitBranch>('GitBranch')({
	name: Schema.String,
	remote: Schema.optional(Schema.String),
	type: Schema.Literals(['local', 'remote'])
}) {}

export class GitBranchesSnapshot extends Schema.Class<GitBranchesSnapshot>('GitBranchesSnapshot')({
	branches: Schema.Array(GitBranch),
	defaultBranch: Schema.String
}) {}

export type GitWorktreeSource = typeof GitWorktreeSource.Type
export const GitWorktreeSource = Schema.Union([
	Schema.Struct({_tag: Schema.Literal('local')}),
	Schema.Struct({_tag: Schema.Literal('remote'), remote: Schema.String}),
	Schema.Struct({_tag: Schema.Literal('new')})
])

export class GitWorktree extends Schema.Class<GitWorktree>('GitWorktree')({
	branch: Schema.optional(Schema.String),
	root: Schema.String
}) {}

export class GitProject extends Schema.Class<GitProject>('GitProject')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}

export function gitReviewCommentKey(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
	readonly source?: 'github' | 'local'
	readonly threadId?: string
}) {
	return `${input.source ?? 'local'}:${input.threadId ?? ''}:${input.filePath}:${input.side ?? 'additions'}:${input.lineNumber}`
}

export function gitReviewMarkKey(input: {readonly filePath: string; readonly fingerprint: string}) {
	return `${input.filePath}:${input.fingerprint}`
}

export function gitReviewMarksForDiff(diff: GitDiff) {
	return Array.map(diff.segments, segment => ({
		filePath: segment.filePath,
		fingerprint: segment.fingerprint,
		segmentId: segment.id
	}))
}

export function gitReviewStateForMarks(segments: readonly GitReviewMark[], reviewedKeys: ReadonlySet<string>) {
	const reviewed = Array.filter(segments, segment => reviewedKeys.has(gitReviewMarkKey(segment)))

	if (Array.isReadonlyArrayEmpty(segments) || Array.isReadonlyArrayEmpty(reviewed)) return 'unchecked' as const
	if (Array.length(reviewed) === Array.length(segments)) return 'checked' as const

	return 'indeterminate' as const
}

export function gitReviewStateSaveComment(state: GitReviewState, comment: GitReviewComment) {
	const key = gitReviewCommentKey(comment)

	return new GitReviewState({
		comments: Array.append(
			Array.filter(state.comments, currentComment => gitReviewCommentKey(currentComment) !== key),
			new GitReviewComment({...comment, resolved: false, source: 'local', threadId: undefined, url: undefined})
		),
		marks: state.marks
	})
}

export function gitReviewStateResolveComment(
	state: GitReviewState,
	input: {readonly filePath: string; readonly lineNumber: number; readonly side?: 'additions' | 'deletions'}
) {
	const key = gitReviewCommentKey({...input, source: 'local'})

	return new GitReviewState({
		comments: Array.map(state.comments, comment =>
			gitReviewCommentKey(comment) === key ? new GitReviewComment({...comment, resolved: true}) : comment
		),
		marks: state.marks
	})
}

export function gitReviewStateMark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	const keys = new Set(Array.map(marks, gitReviewMarkKey))

	return new GitReviewState({
		comments: state.comments,
		marks: Array.appendAll(
			Array.filter(state.marks, mark => !keys.has(gitReviewMarkKey(mark))),
			marks
		)
	})
}

export function gitReviewStateUnmark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	const keys = new Set(Array.map(marks, gitReviewMarkKey))

	return new GitReviewState({
		comments: state.comments,
		marks: Array.filter(state.marks, mark => !keys.has(gitReviewMarkKey(mark)))
	})
}
