import {type Effect, ServiceMap, type Stream} from 'effect'

import type {ModelSelection} from './catalog.ts'
import type {AiError, ConversationMessage, StreamPart, ToolResponsePart, UserContentPart} from './schema.ts'

export const Model = ServiceMap.Service<ModelSelection>('@ai-toolkit/ai/Model')

export const Agent = ServiceMap.Service<{
	prompt: (parts: readonly UserContentPart[]) => Effect.Effect<void, AiError>
	respond: (parts: readonly ToolResponsePart[]) => Effect.Effect<void, AiError>
	stream: Stream.Stream<StreamPart>
	history: Stream.Stream<ConversationMessage[]>
	reset: Effect.Effect<void>
}>('@ai-toolkit/ai/Agent')
