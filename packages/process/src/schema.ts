import {Schema} from 'effect'

export const ManagedProcessStatus = Schema.Literals(['stopped', 'starting', 'running'] as const)

export class ManagedProcessError extends Schema.TaggedErrorClass<ManagedProcessError>()('ManagedProcessError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
