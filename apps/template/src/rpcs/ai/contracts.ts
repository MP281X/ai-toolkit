import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiInput, AiSdkError, Message} from '@ai-toolkit/ai/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class AiContracts extends RpcGroup.make(
	Rpc.make('listMessages', {
		stream: true,
		success: Schema.Array(Message)
	}),
	Rpc.make('sendMessage', {
		payload: AiInput,
		error: AiSdkError
	})
)
	.prefix('ai.')
	.middleware(AuthMiddleware) {}
