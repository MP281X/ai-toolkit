import {Schema} from 'effect'

export const GitFileStatus = Schema.Literals(['added', 'modified', 'deleted', 'renamed'] as const)

export const GitFileChange = Schema.Struct({
	patch: Schema.optional(Schema.String),
	path: Schema.String,
	previousPath: Schema.optional(Schema.String),
	status: GitFileStatus
})

export const GitStatus = Schema.Struct({branch: Schema.optional(Schema.String), dirty: Schema.Boolean})

export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export class GitConflictError extends Schema.TaggedErrorClass<GitConflictError>()('GitConflictError', {
	paths: Schema.Array(Schema.String)
}) {}

export const PullRequest = Schema.Struct({
	base: Schema.String,
	draft: Schema.Boolean,
	head: Schema.String,
	number: Schema.Finite,
	state: Schema.Literals(['open', 'closed', 'merged'] as const),
	title: Schema.String,
	url: Schema.URLFromString
})

export const SourceRepository = Schema.Struct({name: Schema.String, path: Schema.String, url: Schema.URLFromString})

export class GitHubError extends Schema.TaggedErrorClass<GitHubError>()('GitHubError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export class SourceRepositoryError extends Schema.TaggedErrorClass<SourceRepositoryError>()('SourceRepositoryError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
