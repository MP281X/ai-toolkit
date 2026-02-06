import {Rpc, RpcGroup} from '@effect/rpc'

import {AiInput, AiSdkError, StreamPart} from '@ai-toolkit/ai'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: AiInput,
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
) {}
