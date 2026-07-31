import {Schema} from 'effect'

export const RepositoryName = Schema.String.pipe(Schema.brand('RepositoryName'))

export const Repository = Schema.Struct({
	defaultBranch: Schema.String,
	name: RepositoryName,
	path: Schema.String,
	url: Schema.URLFromString
})

export class RepositoryError extends Schema.TaggedErrorClass<RepositoryError>()('RepositoryError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
