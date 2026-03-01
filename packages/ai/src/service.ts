import {type Effect, ServiceMap, type Stream} from 'effect'

import {AiSdkAgentLayer} from './agents/ai-sdk.ts'
import {CopilotSdkAgentLayer} from './agents/copilot-sdk.ts'
import type {ModelSelection} from './catalog.ts'
import {
	AiError,
	type ConversationMessage,
	type StreamPart,
	type ToolResponsePart,
	type UserContentPart
} from './schema.ts'

export class Agent extends ServiceMap.Service<
	Agent,
	{
		prompt: (parts: readonly UserContentPart[]) => Effect.Effect<void, AiError>
		respond: (part: ToolResponsePart) => Effect.Effect<void, AiError>
		stream: Stream.Stream<StreamPart>
		history: Stream.Stream<ConversationMessage[]>
	}
>()('@ai-toolkit/ai/Agent') {
	static layer(input: ModelSelection) {
		switch (input.agent) {
			case 'copilot':
				return CopilotSdkAgentLayer({model: input.model})
			case 'ai':
				return AiSdkAgentLayer({provider: input.provider, model: input.model})
			default:
				throw new AiError({message: 'Not implemented'})
		}
	}
}
