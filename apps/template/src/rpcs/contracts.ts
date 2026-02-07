import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiInput, AiSdkError, Message, StreamPart} from '@ai-toolkit/ai'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: AiInput,
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
) {}

export class MessagesRpcs extends RpcGroup.make(
	Rpc.make('ListMessages', {
		success: Schema.Array(Message),
		stream: true
	})
) {}
