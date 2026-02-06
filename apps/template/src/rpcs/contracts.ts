import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiSdkError, StreamPart} from '@ai-toolkit/ai'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: {prompt: Schema.String},
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
) {}
