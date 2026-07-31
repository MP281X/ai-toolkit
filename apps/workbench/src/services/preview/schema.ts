import {Schema} from 'effect'

export const PreviewExposure = Schema.Struct({id: Schema.String, url: Schema.String})

export class PreviewError extends Schema.TaggedErrorClass<PreviewError>()('PreviewError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
