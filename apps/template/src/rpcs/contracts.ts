import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiSdkError, Model, StreamPart} from '@ai-toolkit/ai'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: {prompt: Schema.String, model: Model},
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
) {}
