import {Schema} from 'effect'

export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export const GitDiffStatus = Schema.Literals(['added', 'deleted', 'modified', 'renamed'])
export type GitDiffStatus = typeof GitDiffStatus.Type

export const GitDiffScope = Schema.Literals(['staged-to-worktree', 'head-to-staged'])
export type GitDiffScope = typeof GitDiffScope.Type

export class GitDiff extends Schema.Class<GitDiff>('GitDiff')({
	filePath: Schema.String,
	patch: Schema.String,
	status: GitDiffStatus
}) {}

export class GitRepository extends Schema.Class<GitRepository>('GitRepository')({
	gitDirectory: Schema.String,
	root: Schema.String
}) {}

export class GitWorktree extends Schema.Class<GitWorktree>('GitWorktree')({
	branch: Schema.optional(Schema.String),
	commit: Schema.String,
	gitDirectory: Schema.String,
	root: Schema.String
}) {}
