import {Schema} from 'effect'

export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class GitDiff extends Schema.Class<GitDiff>('GitDiff')({
	filePath: Schema.String,
	patch: Schema.String
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
