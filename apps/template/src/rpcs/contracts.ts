import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiSdkError, TextStreamPart} from '@ai-toolkit/ai'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: {prompt: Schema.String},
		success: TextStreamPart,
		error: AiSdkError,
		stream: true
	})
) {}
