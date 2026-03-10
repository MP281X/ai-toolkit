import {type Effect, Layer, ServiceMap, type Stream} from 'effect'

import type {ModelSelection} from './catalog.ts'
import type {AgentResponse, AiError, ConversationEvent, PromptPart} from './schema.ts'
import {AiSdkLive} from './sdk.ts'

export class Agent extends ServiceMap.Service<
	Agent,
	{
		prompt: (model: ModelSelection, parts: readonly PromptPart[]) => Effect.Effect<void, AiError>
		respond: (response: AgentResponse) => Effect.Effect<void, AiError>
		stream: Stream.Stream<ConversationEvent>
	}
>()('@ai-toolkit/ai/Agent') {
	static layer = Layer.effect(this, AiSdkLive)
}
