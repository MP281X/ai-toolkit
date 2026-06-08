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

export type TerminalAttachUpdate =
	| {readonly data: string; readonly type: 'snapshot'}
	| {readonly data: string; readonly type: 'data'}
	| {readonly status: TerminalStatus; readonly type: 'status'}

export const TerminalAttachUpdate = Schema.Union([
	Schema.Struct({data: Schema.String, type: Schema.Literal('snapshot')}),
	Schema.Struct({data: Schema.String, type: Schema.Literal('data')}),
	Schema.Struct({status: TerminalStatus, type: Schema.Literal('status')})
])
