import {Schema} from 'effect'

export class OsError extends Schema.TaggedErrorClass<OsError>()('OsError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type Resources = typeof Resources.Type
export const Resources = Schema.Struct({cpu: Schema.Number, memory: Schema.Number, nodeHeap: Schema.Number})
