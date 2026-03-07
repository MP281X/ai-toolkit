import {Schema} from 'effect'

import {AiError, ConversationPart, ToolResponsePart, UserMessagePart} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.events', {
		stream: true,
		success: ConversationPart
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.NonEmptyArray(UserMessagePart),
		error: AiError
	}),
	Rpc.make('ai.tool', {
		payload: ToolResponsePart,
		error: AiError
	})
) {}
