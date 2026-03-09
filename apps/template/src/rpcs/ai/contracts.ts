import {Schema} from 'effect'

import {AiError, ConversationEvent, PromptPart, ToolResponse} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.events', {
		stream: true,
		success: ConversationEvent
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.NonEmptyArray(PromptPart),
		error: AiError
	}),
	Rpc.make('ai.tool', {
		payload: ToolResponse,
		error: AiError
	})
) {}
