import {Schema} from 'effect'

import {AiError, ConversationMessage, ToolResponsePart, UserContentPart} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.listMessages', {
		stream: true,
		success: Schema.Array(ConversationMessage)
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.Array(UserContentPart),
		error: AiError
	}),
	Rpc.make('ai.tool', {
		payload: ToolResponsePart,
		error: AiError
	})
) {}
