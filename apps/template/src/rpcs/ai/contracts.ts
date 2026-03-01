import {Schema} from 'effect'

import {AiError, ConversationMessage, ToolMessagePart, UserMessagePart} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.listMessages', {
		stream: true,
		success: Schema.Array(ConversationMessage)
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.NonEmptyArray(UserMessagePart),
		error: AiError
	}),
	Rpc.make('ai.tool', {
		payload: ToolMessagePart,
		error: AiError
	})
) {}
