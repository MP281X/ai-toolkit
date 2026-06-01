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
export const TerminalStatus = Schema.Union([
	Schema.Struct({state: Schema.Literal('starting')}),
	Schema.Struct({pid: Schema.Number, state: Schema.Literal('running')}),
	Schema.Struct({state: Schema.Literal('stopped')}),
	Schema.Struct({exitCode: Schema.Number, signal: Schema.optional(Schema.Number), state: Schema.Literal('exited')}),
	Schema.Struct({
		exitCode: Schema.optional(Schema.Number),
		signal: Schema.optional(Schema.Number),
		state: Schema.Literal('failed')
	})
])

export type TerminalSignals = typeof TerminalSignals.Type
export const TerminalSignals = Schema.Struct({
	activity: Schema.Union([
		Schema.Literal('idle'),
		Schema.Literal('starting'),
		Schema.Literal('working'),
		Schema.Literal('thinking'),
		Schema.Literal('waiting'),
		Schema.Literal('needs_input'),
		Schema.Literal('unknown')
	]),
	displayTitle: Schema.NullOr(Schema.String),
	notification: Schema.NullOr(Schema.Struct({message: Schema.NullOr(Schema.String), sequence: Schema.Number})),
	title: Schema.NullOr(Schema.String)
})

export type TerminalState = typeof TerminalState.Type
export const TerminalState = Schema.Struct({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	ports: Schema.Array(Schema.Number),
	runId: Schema.Number,
	signals: TerminalSignals,
	size: Schema.Struct({cols: Schema.Number, rows: Schema.Number}),
	status: TerminalStatus
})
