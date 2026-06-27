import {Schema} from 'effect'

import {Prompt} from 'effect/unstable/ai'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export type AiStatus = typeof AiStatus.Type
export const AiStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
})

type ThinkingLevel = typeof ThinkingLevel.Type
const ThinkingLevel = Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)

type AgentId = typeof AgentId.Type
const AgentId = Schema.Literals(['pi'] as const)

type ProviderId = typeof ProviderId.Type
const ProviderId = Schema.Literals(['openai-codex'] as const)

type AiPromptModelId = typeof AiPromptModelId.Type
const AiPromptModelId = Schema.Literals(['gpt-5.5'] as const)

export type AiPrompt = typeof AiPrompt.Type
export const AiPrompt = Schema.Struct({
	messages: Schema.Array(Prompt.Message),
	model: AiPromptModelId,
	provider: ProviderId,
	thinkingLevel: Schema.optional(ThinkingLevel)
})

export type AiLayerConfig = typeof AiLayerConfig.Type
export const AiLayerConfig = Schema.Struct({agent: AgentId, cwd: Schema.String, systemPrompt: Prompt.SystemMessage})
