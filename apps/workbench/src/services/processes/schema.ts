import {Schema} from 'effect'

import {ManagedProcessStatus} from '@deslop/process/schema'

export const ProcessSnapshot = Schema.Struct({
	logs: Schema.Array(Schema.String),
	port: Schema.optional(Schema.Finite),
	script: Schema.String,
	status: ManagedProcessStatus
})

export class ProcessError extends Schema.TaggedErrorClass<ProcessError>()('ProcessError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
