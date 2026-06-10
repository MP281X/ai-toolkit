import {Schema} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

export type PortlessStatus = typeof PortlessStatus.Type
export const PortlessStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'prepared', 'running', 'stopped', 'exited', 'failed'])
})

export class PortlessScript extends Schema.Class<PortlessScript>('PortlessScript')({
	baseOrigin: Schema.optional(Schema.String),
	command: Schema.String,
	commandCwd: Schema.String,
	cwd: Schema.String,
	env: Schema.Record(Schema.String, Schema.String),
	name: Schema.String,
	origin: Schema.optional(Schema.String),
	packageFolder: Schema.String,
	packagePath: Schema.String,
	portless: Schema.Boolean,
	service: Schema.optional(Schema.String),
	sessionId: Schema.String
}) {}

export class PortlessOrigin extends Schema.Class<PortlessOrigin>('PortlessOrigin')({
	base: Schema.optional(Schema.String),
	host: Schema.String,
	origin: Schema.String,
	port: Schema.Number,
	service: Schema.optional(Schema.String),
	sessionId: Schema.String
}) {}

export class PortlessRun extends Schema.Class<PortlessRun>('PortlessRun')({
	origin: PortlessOrigin,
	script: PortlessScript,
	status: PortlessStatus
}) {}

export type PortlessPreparedRun = PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand}
