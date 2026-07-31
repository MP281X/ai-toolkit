import {Schema} from 'effect'

import {PullRequest} from '@deslop/git/schema'

export const PublicationResult = Schema.Struct({commit: Schema.optional(Schema.String), pullRequest: PullRequest})

export class PublicationError extends Schema.TaggedErrorClass<PublicationError>()('PublicationError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
