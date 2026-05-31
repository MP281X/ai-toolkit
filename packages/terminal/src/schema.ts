import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type TerminalEvent = typeof TerminalEvent.Type
export const TerminalEvent = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('data')}),
	Schema.Struct({data: Schema.String, type: Schema.Literal('snapshot')}),
	Schema.Struct({type: Schema.Literal('reset')})
])

export type TerminalStatus = typeof TerminalStatus.Type
export const TerminalStatus = Schema.Struct({
	pid: Schema.optional(Schema.Number),
	state: Schema.Literals(['starting', 'running', 'exited', 'failed', 'stopped'])
})
