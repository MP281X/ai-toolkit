import {Schema} from 'effect'

import {ModelSelection} from '@ai-toolkit/ai/catalog'
import {AgentResponse, AiError, ConversationEvent, PromptPart} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.events', {
		stream: true,
		success: ConversationEvent
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.Struct({model: ModelSelection, parts: Schema.NonEmptyArray(PromptPart)}),
		error: AiError
	}),
	Rpc.make('ai.tool', {
		payload: AgentResponse,
		error: AiError
	})
) {}
