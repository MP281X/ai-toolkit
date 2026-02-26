import {Schema} from 'effect'

import {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {AiSdkError, ConversationMessage, ToolContent, UserContentPart} from '@ai-toolkit/ai/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class AiContracts extends RpcGroup.make(
	Rpc.make('ai.listMessages', {
		stream: true,
		success: Schema.Array(ConversationMessage)
	}),
	Rpc.make('ai.sendMessage', {
		payload: Schema.Struct({
			provider: ProviderId,
			model: ModelId,
			parts: Schema.Array(UserContentPart)
		}),
		error: AiSdkError
	}),
	Rpc.make('ai.tool', {
		payload: ToolContent,
		error: AiSdkError
	})
) {}
