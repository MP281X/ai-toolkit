import {Rpc, RpcGroup} from '@effect/rpc'

import {AiInput, AiSdkError, StreamPart} from '@ai-toolkit/ai/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: AiInput,
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
).middleware(AuthMiddleware) {}
