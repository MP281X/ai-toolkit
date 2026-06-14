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
