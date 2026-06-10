import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
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
export const TerminalSize = Schema.Struct({cols: Schema.Number, rows: Schema.Number})

export type TerminalInput = typeof TerminalInput.Type
export const TerminalInput = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('text')}),
	Schema.Struct({data: Schema.Uint8ArrayFromBase64, type: Schema.Literal('bytes')})
])

export type TerminalCursor = typeof TerminalCursor.Type
export const TerminalCursor = Schema.Struct({epoch: Schema.Number, sequence: Schema.Number})

export type TerminalFrame = typeof TerminalFrame.Type
export const TerminalFrame = Schema.Union([
	Schema.Struct({cursor: TerminalCursor, type: Schema.Literal('reset')}),
	Schema.Struct({cursor: TerminalCursor, data: Schema.String, type: Schema.Literal('output')}),
	Schema.Struct({cursor: TerminalCursor, size: TerminalSize, type: Schema.Literal('resize')})
])
