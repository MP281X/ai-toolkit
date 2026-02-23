import {Schema} from 'effect'

export class GitError extends Schema.TaggedError<GitError>()('GitError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class GitDiff extends Schema.Class<GitDiff>('GitDiff')({
	filePath: Schema.String,
	patch: Schema.String
}) {}
