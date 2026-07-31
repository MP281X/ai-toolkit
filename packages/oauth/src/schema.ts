import {Schema} from 'effect'

export const OAuthSession = Schema.Struct({login: Schema.String, userId: Schema.String})

export class OAuthError extends Schema.TaggedErrorClass<OAuthError>()('OAuthError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
