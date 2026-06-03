import {Schema} from 'effect'

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
	filePath: Schema.String,
	patch: Schema.String,
	segments: Schema.Array(GitDiffSegment),
	status: GitDiffStatus
}) {}

export type GitReviewFrom = typeof GitReviewFrom.Type
export const GitReviewFrom = Schema.Union([
	Schema.Struct({ref: Schema.String, type: Schema.Literal('ref')}),
	Schema.Struct({base: Schema.String, type: Schema.Literal('merge-base')})
])

export type GitReviewTo = typeof GitReviewTo.Type
export const GitReviewTo = Schema.Union([
	Schema.Struct({ref: Schema.String, type: Schema.Literal('ref')}),
	Schema.Struct({type: Schema.Literal('worktree')})
])

export class GitCommit extends Schema.Class<GitCommit>('GitCommit')({
	hash: Schema.String,
	parents: Schema.Array(Schema.String),
	shortHash: Schema.String,
	subject: Schema.String,
	wip: Schema.Boolean
}) {}

export class GitReviewMetadata extends Schema.Class<GitReviewMetadata>('GitReviewMetadata')({
	base: Schema.String,
	branch: Schema.String,
	commits: Schema.Array(GitCommit),
	defaultBranch: Schema.String,
	dirty: Schema.Boolean,
	prUrl: Schema.optional(Schema.String),
	unpushedCommits: Schema.Boolean
}) {}

export class GitHubReviewThread extends Schema.Class<GitHubReviewThread>('GitHubReviewThread')({
	body: Schema.String,
	filePath: Schema.String,
	id: Schema.String,
	lineNumber: Schema.Number,
	resolved: Schema.Boolean,
	side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
	url: Schema.optional(Schema.String)
}) {}

export const GitHubRepositoryResponse = Schema.Struct({
	name: Schema.String,
	owner: Schema.Struct({login: Schema.String})
})

const GitHubReviewThreadCommentResponse = Schema.Struct({
	body: Schema.String,
	line: Schema.optional(Schema.NullOr(Schema.Number)),
	originalLine: Schema.optional(Schema.NullOr(Schema.Number)),
	path: Schema.String,
	url: Schema.optional(Schema.String)
})

const GitHubReviewThreadResponse = Schema.Struct({
	comments: Schema.Struct({nodes: Schema.Array(GitHubReviewThreadCommentResponse)}),
	diffSide: Schema.optional(Schema.String),
	id: Schema.String,
	isResolved: Schema.Boolean
})

const GitHubPullRequestResponse = Schema.Struct({
	reviewThreads: Schema.optional(Schema.Struct({nodes: Schema.Array(GitHubReviewThreadResponse)}))
})

const GitHubReviewRepositoryResponse = Schema.Struct({pullRequest: Schema.optional(GitHubPullRequestResponse)})

export const GitHubReviewThreadsResponse = Schema.Struct({
	data: Schema.optional(Schema.Struct({repository: Schema.optional(GitHubReviewRepositoryResponse)}))
})

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

export class GitWorktreeStatus extends Schema.Class<GitWorktreeStatus>('GitWorktreeStatus')({
	ahead: Schema.Number,
	behind: Schema.Number,
	dirtyTracked: Schema.Boolean,
	unpushedCommits: Schema.Boolean,
	untracked: Schema.Boolean
}) {}

export class GitWorktree extends Schema.Class<GitWorktree>('GitWorktree')({
	branch: Schema.optional(Schema.String),
	root: Schema.String,
	status: Schema.optional(GitWorktreeStatus)
}) {}

export class GitProject extends Schema.Class<GitProject>('GitProject')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}
