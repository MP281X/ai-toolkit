import {Schema} from 'effect'

import {Response} from 'effect/unstable/ai'

import {AgentId} from './catalog.ts'
import {AgentToolKit} from './tools/contracts.ts'

export type AgentStatus = typeof AgentStatus.Type
export const AgentStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
})

export class AgentKey extends Schema.Class<AgentKey>('AgentKey')({
	agent: AgentId,
	cwd: Schema.String,
	id: Schema.NonEmptyString
}) {}

export type AgentEvent = typeof AgentEvent.Type
export const AgentEvent = Schema.Union([
	Schema.Struct({
		prompt: Schema.NonEmptyString,
		type: Schema.Literal('user-message')
	}),
	Schema.Struct({
		part: Response.StreamPart(AgentToolKit),
		type: Schema.Literal('agent-part')
	})
])
