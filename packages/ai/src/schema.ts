import {Schema} from 'effect'

import {Prompt} from 'effect/unstable/ai'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

export type AgentStatus = typeof AgentStatus.Type
const AgentStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
})

type ThinkingLevel = typeof ThinkingLevel.Type
const ThinkingLevel = Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)

type AgentId = typeof AgentId.Type
const AgentId = Schema.Literals(['pi'] as const)

type ProviderId = typeof ProviderId.Type
const ProviderId = Schema.Literals(['openai-codex'] as const)

type ModelId = typeof ModelId.Type
const ModelId = Schema.Literals(['gpt-5.5'] as const)

export type AgentPrompt = typeof AgentPrompt.Type
const AgentPrompt = Schema.Struct({
	messages: Schema.Array(Prompt.Message),
	model: ModelId,
	provider: ProviderId,
	thinkingLevel: Schema.optional(ThinkingLevel)
})

export type AgentLayerConfig = typeof AgentLayerConfig.Type
const AgentLayerConfig = Schema.Struct({
	agent: AgentId,
	cwd: Schema.String,
	systemPrompt: Prompt.SystemMessage,
	tools: Schema.optional(Schema.Union([Schema.Literals(['all', 'none'] as const), Schema.Array(Schema.String)]))
})

export type AgentCommandProfileId = typeof AgentCommandProfileId.Type
export const AgentCommandProfileId = Schema.Literals(['codex-gpt-5.5', 'claude-code-opus-4.8'])

export type AgentCommandIcon = typeof AgentCommandIcon.Type
export const AgentCommandIcon = Schema.Literals(['codex', 'claude'])

export type AgentCommandProfile = typeof AgentCommandProfile.Type
export const AgentCommandProfile = Schema.Struct({
	icon: AgentCommandIcon,
	id: AgentCommandProfileId,
	label: Schema.String
})

export type AgentCommandRequest = typeof AgentCommandRequest.Type
export const AgentCommandRequest = Schema.Struct({cwd: Schema.String, profileId: AgentCommandProfileId})
