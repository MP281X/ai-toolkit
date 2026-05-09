import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type TerminalEvent = typeof TerminalEvent.Type
export const TerminalEvent = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('data')}),
	Schema.Struct({data: Schema.String, type: Schema.Literal('snapshot')})
])
