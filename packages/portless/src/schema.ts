import {Schema} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

export class PortlessScript extends Schema.Class<PortlessScript>('PortlessScript')({
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.Record(Schema.String, Schema.String),
	sessionId: Schema.String,
	taskId: Schema.String
}) {}

export class PortlessOrigin extends Schema.Class<PortlessOrigin>('PortlessOrigin')({
	host: Schema.String,
	origin: Schema.String,
	port: Schema.Number
}) {}

export class PortlessRun extends Schema.Class<PortlessRun>('PortlessRun')({
	origin: PortlessOrigin,
	script: PortlessScript
}) {}

export type PortlessPreparedRun = {
	readonly origin: PortlessOrigin
	readonly preparedCommand: ChildProcess.StandardCommand
	readonly script: PortlessScript
}
