import {Schema} from 'effect'

type PortlessStatus = typeof PortlessStatus.Type
const PortlessStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'prepared', 'running', 'stopped', 'exited', 'failed'])
})

export type PortlessScript = typeof PortlessScript.Type
export const PortlessScript = Schema.Struct({
	baseOrigin: Schema.optional(Schema.String),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.Record(Schema.String, Schema.String),
	origin: Schema.optional(Schema.String),
	packageName: Schema.optional(Schema.String),
	portless: Schema.Boolean,
	scriptName: Schema.optional(Schema.String),
	sessionId: Schema.String,
	taskId: Schema.String
})

export type PortlessOrigin = typeof PortlessOrigin.Type
export const PortlessOrigin = Schema.Struct({
	base: Schema.optional(Schema.String),
	host: Schema.String,
	origin: Schema.String,
	port: Schema.Number,
	sessionId: Schema.String,
	taskId: Schema.String,
	worktree: Schema.String
})

export type PortlessRun = typeof PortlessRun.Type
export const PortlessRun = Schema.Struct({origin: PortlessOrigin, script: PortlessScript, status: PortlessStatus})
