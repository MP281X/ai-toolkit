import {Schema} from 'effect'

export class AgentError extends Schema.TaggedErrorClass<AgentError>()('AgentError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type AgentProvider = typeof AgentProvider.Type
export const AgentProvider = Schema.Literals(['codex', 'claude'] as const)

export type AgentLayerConfig = typeof AgentLayerConfig.Type
export const AgentLayerConfig = Schema.Struct({cwd: Schema.String, provider: AgentProvider})

export type AgentSubscription = typeof AgentSubscription.Type
export const AgentSubscription = Schema.String.pipe(Schema.brand('AgentSubscription'))

export type AgentUsageWindow = typeof AgentUsageWindow.Type
export const AgentUsageWindow = Schema.Struct({resetsAt: Schema.optional(Schema.String), utilization: Schema.Number})

export type AgentUsageTokens = typeof AgentUsageTokens.Type
export const AgentUsageTokens = Schema.Struct({cached: Schema.Number, input: Schema.Number, output: Schema.Number})

export type AgentUsageData = typeof AgentUsageData.Type
export const AgentUsageData = Schema.Struct({
	fiveHour: AgentUsageWindow,
	tokens: AgentUsageTokens,
	weekly: AgentUsageWindow
})
