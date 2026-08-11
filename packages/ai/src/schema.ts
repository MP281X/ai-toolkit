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

export type AiModel = typeof AiModel.Type
export const AiModel = Schema.Struct({
	id: Schema.Literals(['gpt-5.5'] as const),
	provider: Schema.Literals(['openai-codex'] as const),
	reasoning: Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)
})
