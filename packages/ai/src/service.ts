import {type Effect, ServiceMap, type Stream} from 'effect'

import {AiSdkAgentLayer} from './agents/ai-sdk.ts'
import {CopilotSdkAgentLayer} from './agents/copilot-sdk.ts'
import {OpencodeSdkAgentLayer} from './agents/opencode-sdk.ts'
import type {ModelSelection} from './catalog.ts'
import {
	AiError,
	type ConversationMessage,
	type MessageStreamPart,
	type ToolMessagePart,
	type UserMessagePart
} from './schema.ts'

export class Agent extends ServiceMap.Service<
	Agent,
	{
		prompt: (parts: readonly UserMessagePart[]) => Effect.Effect<void, AiError>
		respond: (part: ToolMessagePart) => Effect.Effect<void, AiError>
		stream: Stream.Stream<MessageStreamPart>
		history: Stream.Stream<ConversationMessage[]>
	}
>()('@ai-toolkit/ai/Agent') {
	static layer(input: ModelSelection) {
		switch (input.agent) {
			case 'copilot':
				return CopilotSdkAgentLayer({model: input.model})
			case 'ai':
				return AiSdkAgentLayer({provider: input.provider, model: input.model})
			case 'opencode':
				return OpencodeSdkAgentLayer({provider: input.provider, model: input.model})
			default:
				throw new AiError({message: 'Not implemented'})
		}
	}
}
