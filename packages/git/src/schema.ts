import {Array, Equal, Match, Schema} from 'effect'

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

export class GitReviewChangesTarget extends Schema.TaggedClass<GitReviewChangesTarget>()('changes', {}) {}
export class GitReviewLocalTarget extends Schema.TaggedClass<GitReviewLocalTarget>()('local', {}) {}
export class GitReviewBranchTarget extends Schema.TaggedClass<GitReviewBranchTarget>()('branch', {}) {}
export class GitReviewCommitTarget extends Schema.TaggedClass<GitReviewCommitTarget>()('commit', {
	hash: Schema.String
}) {}

export type GitReviewScopeTarget = GitReviewChangesTarget | GitReviewLocalTarget | GitReviewBranchTarget
export type GitReviewTarget = typeof GitReviewTarget.Type
export const GitReviewTarget = Schema.Union([
	GitReviewChangesTarget,
	GitReviewLocalTarget,
	GitReviewBranchTarget,
	GitReviewCommitTarget
])

export function gitReviewTargetIsCommit(target: GitReviewTarget): target is GitReviewCommitTarget {
	return Match.value(target).pipe(
		Match.tag('commit', () => true),
		Match.orElse(() => false)
	)
}

export function gitReviewTargetIsScope(target: GitReviewTarget): target is GitReviewScopeTarget {
	return Match.value(target).pipe(
		Match.tag('commit', () => false),
		Match.orElse(() => true)
	)
}

export function gitReviewTargetTag(target: GitReviewTarget) {
	return Match.value(target).pipe(
		Match.tag('changes', () => 'changes' as const),
		Match.tag('local', () => 'local' as const),
		Match.tag('branch', () => 'branch' as const),
		Match.tag('commit', () => 'commit' as const),
		Match.exhaustive
	)
}

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
	fingerprint: Schema.String
}) {}

export class GitReviewComment extends Schema.Class<GitReviewComment>('GitReviewComment')({
	body: Schema.String,
	filePath: Schema.String,
	lineNumber: Schema.Number,
	resolved: Schema.Boolean,
	side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
	source: Schema.Literals(['local', 'github']),
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

export class GitWorktreeLocalSource extends Schema.TaggedClass<GitWorktreeLocalSource>()('local', {}) {}
export class GitWorktreeRemoteSource extends Schema.TaggedClass<GitWorktreeRemoteSource>()('remote', {
	remote: Schema.String
}) {}
export class GitWorktreeNewSource extends Schema.TaggedClass<GitWorktreeNewSource>()('new', {}) {}

export type GitWorktreeSource = typeof GitWorktreeSource.Type
export const GitWorktreeSource = Schema.Union([GitWorktreeLocalSource, GitWorktreeRemoteSource, GitWorktreeNewSource])

export class GitWorktree extends Schema.Class<GitWorktree>('GitWorktree')({
	branch: Schema.optional(Schema.String),
	root: Schema.String
}) {}

export class GitProject extends Schema.Class<GitProject>('GitProject')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}

function gitReviewCommentLocation(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
	readonly source: 'github' | 'local'
	readonly threadId?: string
}) {
	return {
		filePath: input.filePath,
		lineNumber: input.lineNumber,
		side: input.side ?? 'additions',
		source: input.source,
		threadId: input.threadId
	}
}

export function gitReviewMarksForDiff(diff: GitDiff) {
	return Array.map(
		diff.segments,
		segment => new GitReviewMark({filePath: segment.filePath, fingerprint: segment.fingerprint})
	)
}

export function gitReviewStateForMarks(segments: readonly GitReviewMark[], reviewedMarks: readonly GitReviewMark[]) {
	const reviewed = Array.filter(segments, segment => Array.containsWith(Equal.equals)(segment)(reviewedMarks))

	if (Array.isReadonlyArrayEmpty(segments) || Array.isReadonlyArrayEmpty(reviewed)) return 'unchecked' as const
	if (Array.length(reviewed) === Array.length(segments)) return 'checked' as const

	return 'indeterminate' as const
}

export function gitReviewStateSaveComment(state: GitReviewState, comment: GitReviewComment) {
	return new GitReviewState({
		comments: Array.append(
			Array.filter(
				state.comments,
				currentComment => !Equal.equals(gitReviewCommentLocation(currentComment), gitReviewCommentLocation(comment))
			),
			new GitReviewComment({
				body: comment.body,
				filePath: comment.filePath,
				lineNumber: comment.lineNumber,
				resolved: false,
				side: comment.side,
				source: 'local',
				threadId: undefined,
				url: undefined
			})
		),
		marks: state.marks
	})
}

export function gitReviewStateResolveComment(
	state: GitReviewState,
	input: {readonly filePath: string; readonly lineNumber: number; readonly side?: 'additions' | 'deletions'}
) {
	return new GitReviewState({
		comments: Array.map(state.comments, comment =>
			Equal.equals(gitReviewCommentLocation(comment), gitReviewCommentLocation({...input, source: 'local'}))
				? new GitReviewComment({
						body: comment.body,
						filePath: comment.filePath,
						lineNumber: comment.lineNumber,
						resolved: true,
						side: comment.side,
						source: comment.source,
						threadId: comment.threadId,
						url: comment.url
					})
				: comment
		),
		marks: state.marks
	})
}

export function gitReviewStateMark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	return new GitReviewState({
		comments: state.comments,
		marks: Array.appendAll(
			Array.filter(state.marks, mark => !Array.containsWith(Equal.equals)(mark)(marks)),
			marks
		)
	})
}

export function gitReviewStateUnmark(state: GitReviewState, marks: readonly GitReviewMark[]) {
	return new GitReviewState({
		comments: state.comments,
		marks: Array.filter(state.marks, mark => !Array.containsWith(Equal.equals)(mark)(marks))
	})
}
