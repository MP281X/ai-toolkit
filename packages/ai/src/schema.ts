import {Schema} from 'effect'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

export class AgentStatus extends Schema.Class<AgentStatus>('AgentStatus')({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
}) {}
