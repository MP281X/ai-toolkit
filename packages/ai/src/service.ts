import {type Effect, ServiceMap, type Stream} from 'effect'

import {AiSdkAgentLayer} from './agents/ai-sdk.ts'
import {CopilotSdkAgentLayer} from './agents/copilot-sdk.ts'
import type {ModelSelection} from './catalog.ts'
import {AiError, type ConversationEvent, type PromptPart, type ToolResponse} from './schema.ts'

export class Agent extends ServiceMap.Service<
	Agent,
	{
		prompt: (parts: readonly PromptPart[]) => Effect.Effect<void, AiError>
		respond: (response: ToolResponse) => Effect.Effect<void, AiError>
		stream: Stream.Stream<ConversationEvent>
	}
>()('@ai-toolkit/ai/Agent') {
	static layer(selection: ModelSelection) {
		switch (selection.agent) {
			case 'ai':
				return AiSdkAgentLayer(selection)
			case 'copilot':
				return CopilotSdkAgentLayer(selection)
			default:
				throw new AiError({message: 'Unsupported agent selection'})
		}
	}
}
