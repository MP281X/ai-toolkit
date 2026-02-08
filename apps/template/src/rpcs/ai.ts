import {Rpc, RpcGroup} from '@effect/rpc'
import {Effect} from 'effect'

import {AiInput, AiSdk, AiSdkError, StreamPart} from '@ai-toolkit/ai'

import {AuthMiddleware} from '#rpcs/middlewares.ts'

export class AiRpcs extends RpcGroup.make(
	Rpc.make('AiStream', {
		payload: AiInput,
		success: StreamPart,
		error: AiSdkError,
		stream: true
	})
).middleware(AuthMiddleware) {}

export const AiLive = AiRpcs.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk

		return AiRpcs.of({
			AiStream: args => aiSdk.stream(args)
		})
	})
)
