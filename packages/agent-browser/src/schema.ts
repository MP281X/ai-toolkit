import {Schema} from 'effect'

export class AgentBrowserError extends Schema.TaggedErrorClass<AgentBrowserError>()('AgentBrowserError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

export type AgentBrowserTabSwitch = typeof AgentBrowserTabSwitch.Type
export const AgentBrowserTabSwitch = Schema.Struct({session: Schema.String, tab: Schema.String})
