import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedError<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.optional(Schema.String)
}) {}

export type TerminalStatus = typeof TerminalStatus.Type
export const TerminalStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'starting', 'running', 'waiting', 'stopped', 'exited', 'failed']),
	title: Schema.String
})

export function terminalStatusActive(state: TerminalStatus['state']) {
	return state === 'idle' || state === 'starting' || state === 'running' || state === 'waiting'
}

export type TerminalSize = typeof TerminalSize.Type
const TerminalSize = Schema.Struct({cols: Schema.Finite, rows: Schema.Finite})

export type TerminalInput = typeof TerminalInput.Type
export const TerminalInput = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('text')}),
	Schema.Struct({data: Schema.Uint8ArrayFromBase64, type: Schema.Literal('bytes')})
])

export type TerminalFrame = typeof TerminalFrame.Type
export const TerminalFrame = Schema.Union([
	Schema.Struct({sequence: Schema.Finite, type: Schema.Literal('reset')}),
	Schema.Struct({data: Schema.String, sequence: Schema.Finite, type: Schema.Literal('output')})
])
