import {Schema} from 'effect'

export class UsageError extends Schema.TaggedErrorClass<UsageError>()('UsageError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class UsageWindow extends Schema.Class<UsageWindow>('UsageWindow')({
	resetsAt: Schema.optional(Schema.String),
	utilization: Schema.Number
}) {}

export class UsageProvider extends Schema.Class<UsageProvider>('UsageProvider')({
	fiveHour: UsageWindow,
	weekly: UsageWindow
}) {}

export class SystemUsage extends Schema.Class<SystemUsage>('SystemUsage')({
	cpuUtilization: Schema.Number,
	memoryUtilization: Schema.Number
}) {}

export type ClaudeCredentials = typeof ClaudeCredentials.Type
export const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)

class ClaudeUsageWindow extends Schema.Class<ClaudeUsageWindow>('ClaudeUsageWindow')({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Number
}) {}

export class ClaudeUsage extends Schema.Class<ClaudeUsage>('ClaudeUsage')({
	five_hour: ClaudeUsageWindow,
	seven_day: ClaudeUsageWindow
}) {}

export type CodexCredentials = typeof CodexCredentials.Type
export const CodexCredentials = Schema.fromJsonString(
	Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})})
)

class CodexUsageWindow extends Schema.Class<CodexUsageWindow>('CodexUsageWindow')({
	reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
	used_percent: Schema.Number
}) {}

export class CodexUsage extends Schema.Class<CodexUsage>('CodexUsage')({
	rate_limit: Schema.Struct({primary_window: CodexUsageWindow, secondary_window: CodexUsageWindow})
}) {}
