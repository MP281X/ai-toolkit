import {Schema} from 'effect'

export class PortlessStatus extends Schema.Class<PortlessStatus>('PortlessStatus')({
	state: Schema.Literals(['idle', 'prepared', 'running', 'stopped', 'exited', 'failed'])
}) {}

export class PortlessScript extends Schema.Class<PortlessScript>('PortlessScript')({
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
}) {}

export class PortlessOrigin extends Schema.Class<PortlessOrigin>('PortlessOrigin')({
	base: Schema.optional(Schema.String),
	host: Schema.String,
	origin: Schema.String,
	port: Schema.Number,
	sessionId: Schema.String,
	taskId: Schema.String
}) {}

export class PortlessRun extends Schema.Class<PortlessRun>('PortlessRun')({
	origin: PortlessOrigin,
	script: PortlessScript,
	status: PortlessStatus
}) {}

export class PortlessPackageJson extends Schema.Class<PortlessPackageJson>('PortlessPackageJson')({
	deslop: Schema.optional(Schema.Struct({portless: Schema.optional(Schema.Array(Schema.String))})),
	name: Schema.optional(Schema.String),
	scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))
}) {}
