import {Schema} from 'effect'

export class AiError extends Schema.TaggedError<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export type AiStatus = typeof AiStatus.Type
export const AiStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
})

export type AiAgent = typeof AiAgent.Type
export const AiAgent = Schema.Literals(['pi'] as const)

export type AiSessionId = typeof AiSessionId.Type
export const AiSessionId = Schema.Struct({agent: AiAgent, id: Schema.String})

export type AiSkill = typeof AiSkill.Type
export const AiSkill = Schema.Struct({
	description: Schema.String,
	instructions: Schema.String,
	name: Schema.String,
	resources: Schema.optional(Schema.Record(Schema.String, Schema.String))
})

export type AiAgentDefinition = typeof AiAgentDefinition.Type
export const AiAgentDefinition = Schema.Struct({
	description: Schema.String,
	instructions: Schema.String,
	name: Schema.String,
	skills: Schema.Array(AiSkill),
	tools: Schema.Array(Schema.String)
})

export type AiModel = typeof AiModel.Type
export const AiModel = Schema.Struct({
	id: Schema.Literals(['gpt-5.6-luna'] as const),
	provider: Schema.Literals(['openai-codex'] as const),
	reasoning: Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const)
})
