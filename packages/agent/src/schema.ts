import {Schema} from 'effect'

export const AgentStatus = Schema.Literals(['idle', 'running', 'retrying'] as const)

export class AgentError extends Schema.TaggedErrorClass<AgentError>()('AgentError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export const AgentQuota = Schema.Struct({
	plan: Schema.optional(Schema.String),
	weeklyRemaining: Schema.Finite,
	weeklyResetAt: Schema.DateTimeUtc
})

export const AgentUsageProvider = Schema.Literals(['openai-codex'] as const)
