import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type TerminalEvent = typeof TerminalEvent.Type
export const TerminalEvent = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('data')}),
	Schema.Struct({type: Schema.Literal('reset')})
])

export type TerminalAction = typeof TerminalAction.Type
export const TerminalAction = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('write')}),
	Schema.Struct({cols: Schema.Number, rows: Schema.Number, type: Schema.Literal('resize')}),
	Schema.Struct({type: Schema.Literal('restart')}),
	Schema.Struct({type: Schema.Literal('stop')})
])

export type TerminalState = typeof TerminalState.Type
export const TerminalState = Schema.Struct({
	runId: Schema.Number,
	state: Schema.Literals(['idle', 'starting', 'running', 'waiting', 'needs_input', 'stopped', 'exited', 'failed']),
	title: Schema.String
})

export function terminalStateActive(state: TerminalState['state']) {
	return (
		state === 'idle' || state === 'starting' || state === 'running' || state === 'waiting' || state === 'needs_input'
	)
}

export type TerminalUpdate = typeof TerminalUpdate.Type
export const TerminalUpdate = Schema.Union([
	Schema.Struct({state: TerminalState, type: Schema.Literal('state')}),
	Schema.Struct({event: TerminalEvent, type: Schema.Literal('event')})
])
