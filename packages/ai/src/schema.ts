import {Schema} from 'effect'

import {Prompt} from 'effect/unstable/ai'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.String
}) {}

export class AgentStatus extends Schema.Class<AgentStatus>('AgentStatus')({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
}) {}

type ThinkingLevel = typeof ThinkingLevel.Type
const ThinkingLevel = Schema.Literals(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)

type AgentId = typeof AgentId.Type
const AgentId = Schema.Literals(['pi'] as const)

type ProviderId = typeof ProviderId.Type
const ProviderId = Schema.Literals(['openai-codex'] as const)

type ModelId = typeof ModelId.Type
const ModelId = Schema.Literals(['gpt-5.5'] as const)

export class AgentPrompt extends Schema.Class<AgentPrompt>('AgentPrompt')({
	messages: Schema.Array(Prompt.Message),
	model: ModelId,
	provider: ProviderId,
	thinkingLevel: Schema.optional(ThinkingLevel)
}) {}

export class AgentLayerConfig extends Schema.Class<AgentLayerConfig>('AgentLayerConfig')({
	agent: AgentId,
	cwd: Schema.String,
	systemPrompt: Prompt.SystemMessage,
	tools: Schema.optional(Schema.Union([Schema.Literals(['all', 'none'] as const), Schema.Array(Schema.String)]))
}) {}

export type AgentCommandProfileId = typeof AgentCommandProfileId.Type
export const AgentCommandProfileId = Schema.Literals([
	'opencode-gpt-5.5',
	'codex-gpt-5.5-low',
	'pi-gpt-5.5-low',
	'claude-code-opus-4.8-bypass'
])

export type AgentCommandIcon = typeof AgentCommandIcon.Type
export const AgentCommandIcon = Schema.Literals(['opencode', 'codex', 'pi', 'claude'])

export class AgentCommandProfile extends Schema.Class<AgentCommandProfile>('AgentCommandProfile')({
	icon: AgentCommandIcon,
	id: AgentCommandProfileId,
	label: Schema.String
}) {}

export class AgentCommandRequest extends Schema.Class<AgentCommandRequest>('AgentCommandRequest')({
	cwd: Schema.String,
	profileId: AgentCommandProfileId
}) {}
