import {Schema} from 'effect'

export class AgentBrowserError extends Schema.TaggedErrorClass<AgentBrowserError>()('AgentBrowserError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

export type AgentBrowserHealth = typeof AgentBrowserHealth.Type
export const AgentBrowserHealth = Schema.Struct({
	available: Schema.Boolean,
	bin: Schema.optional(Schema.String),
	binDir: Schema.optional(Schema.String)
})

export type AgentBrowserSession = typeof AgentBrowserSession.Type
export const AgentBrowserSession = Schema.Struct({
	engine: Schema.optional(Schema.String),
	extensions: Schema.Array(Schema.String),
	name: Schema.String,
	pid: Schema.Number,
	provider: Schema.optional(Schema.String),
	streamPort: Schema.Number,
	version: Schema.optional(Schema.String)
})

export type AgentBrowserOpenRequest = typeof AgentBrowserOpenRequest.Type
export const AgentBrowserOpenRequest = Schema.Struct({session: Schema.String, url: Schema.String})

export type AgentBrowserSessionRequest = typeof AgentBrowserSessionRequest.Type
export const AgentBrowserSessionRequest = Schema.Struct({session: Schema.String})

export type AgentBrowserTabOpenRequest = typeof AgentBrowserTabOpenRequest.Type
export const AgentBrowserTabOpenRequest = Schema.Struct({
	label: Schema.String,
	session: Schema.String,
	url: Schema.String
})

export type AgentBrowserTabSwitchRequest = typeof AgentBrowserTabSwitchRequest.Type
export const AgentBrowserTabSwitchRequest = Schema.Struct({session: Schema.String, tab: Schema.String})

export type AgentBrowserViewportRequest = typeof AgentBrowserViewportRequest.Type
export const AgentBrowserViewportRequest = Schema.Struct({
	height: Schema.Number,
	session: Schema.String,
	width: Schema.Number
})
