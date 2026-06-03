import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type TerminalEvent = typeof TerminalEvent.Type
export const TerminalEvent = Schema.Struct({data: Schema.String, sequence: Schema.Number, type: Schema.Literal('data')})

export type TerminalState = typeof TerminalState.Type
export const TerminalState = Schema.Struct({
	runId: Schema.Number,
	state: Schema.Literals(['idle', 'starting', 'running', 'waiting', 'stopped', 'exited', 'failed']),
	title: Schema.String
})

export function terminalStateActive(state: TerminalState['state']) {
	return state === 'idle' || state === 'starting' || state === 'running' || state === 'waiting'
}

export type TerminalUpdate = typeof TerminalUpdate.Type
export const TerminalUpdate = Schema.Union([
	Schema.Struct({state: TerminalState, type: Schema.Literal('state')}),
	TerminalEvent
])
