import {Schema} from 'effect'

import {Response} from 'effect/unstable/ai'

export class UsageError extends Schema.TaggedErrorClass<UsageError>()('UsageError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type UsageWindow = typeof UsageWindow.Type
export const UsageWindow = Schema.Struct({resetsAt: Schema.optional(Schema.String), utilization: Schema.Number})

type UsageSubscription = typeof UsageSubscription.Type
const UsageSubscription = Schema.Struct({details: Schema.optional(Schema.String), label: Schema.String})

export type UsageProvider = typeof UsageProvider.Type
export const UsageProvider = Schema.Struct({
	fiveHour: UsageWindow,
	subscription: Schema.optional(UsageSubscription),
	weekly: UsageWindow
})

export type NodeProcessUsage = typeof NodeProcessUsage.Type
export const NodeProcessUsage = Schema.Struct({
	heapLimitBytes: Schema.Number,
	heapUsedBytes: Schema.Number,
	heapUtilization: Schema.Number
})

export type SystemUsage = typeof SystemUsage.Type
export const SystemUsage = Schema.Struct({
	cpuUtilization: Schema.Number,
	memoryUtilization: Schema.Number,
	nodeProcess: NodeProcessUsage
})

type UsageModelUsage = typeof UsageModelUsage.Type
const UsageModelUsage = Schema.Struct({model: Schema.optional(Schema.String), usage: Response.Usage})

type UsageTokenBucket = typeof UsageTokenBucket.Type
const UsageTokenBucket = Schema.Struct({modelUsages: Schema.Array(UsageModelUsage), usage: Response.Usage})

export type UsageTokenProvider = typeof UsageTokenProvider.Type
export const UsageTokenProvider = Schema.Struct({
	month: UsageTokenBucket,
	provider: Schema.Literals(['claude', 'codex']),
	today: UsageTokenBucket,
	total: UsageTokenBucket
})

export type UsageTokens = typeof UsageTokens.Type
export const UsageTokens = Schema.Struct({providers: Schema.Array(UsageTokenProvider), updatedAt: Schema.String})

export type ClaudeCredentials = typeof ClaudeCredentials.Type
export const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)

type ClaudeUsageWindow = typeof ClaudeUsageWindow.Type
const ClaudeUsageWindow = Schema.Struct({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Number
})

export type ClaudeUsage = typeof ClaudeUsage.Type
export const ClaudeUsage = Schema.Struct({five_hour: ClaudeUsageWindow, seven_day: ClaudeUsageWindow})

export type CodexCredentials = typeof CodexCredentials.Type
export const CodexCredentials = Schema.fromJsonString(
	Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})})
)

type CodexUsageWindow = typeof CodexUsageWindow.Type
const CodexUsageWindow = Schema.Struct({
	reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
	used_percent: Schema.Number
})

export type CodexUsage = typeof CodexUsage.Type
export const CodexUsage = Schema.Struct({
	plan_type: Schema.optional(Schema.NullOr(Schema.String)),
	rate_limit: Schema.Struct({primary_window: CodexUsageWindow, secondary_window: CodexUsageWindow})
})
