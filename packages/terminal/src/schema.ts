import {Schema} from 'effect'

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class TerminalStatus extends Schema.Class<TerminalStatus>('TerminalStatus')({
	state: Schema.Literals(['idle', 'starting', 'running', 'waiting', 'stopped', 'exited', 'failed']),
	title: Schema.String
}) {}

export function terminalStatusActive(state: TerminalStatus['state']) {
	return state === 'idle' || state === 'starting' || state === 'running' || state === 'waiting'
}

export class TerminalSize extends Schema.Class<TerminalSize>('TerminalSize')({
	cols: Schema.Int.check(Schema.isBetween({maximum: 1_000, minimum: 2})),
	rows: Schema.Int.check(Schema.isBetween({maximum: 1_000, minimum: 1}))
}) {}

export type TerminalInput = typeof TerminalInput.Type
export const TerminalInput = Schema.Union([
	Schema.Struct({data: Schema.String.check(Schema.isMaxLength(64 * 1024)), type: Schema.Literal('text')}),
	Schema.Struct({data: Schema.Uint8ArrayFromBase64.check(Schema.isMaxLength(64 * 1024)), type: Schema.Literal('bytes')})
])

export type TerminalFrame = typeof TerminalFrame.Type
export const TerminalFrame = Schema.Union([
	Schema.Struct({sequence: Schema.Number, type: Schema.Literal('reset')}),
	Schema.Struct({data: Schema.String, sequence: Schema.Number, type: Schema.Literal('output')}),
	Schema.Struct({sequence: Schema.Number, type: Schema.Literal('overflow')})
])
