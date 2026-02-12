import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AiInput, AiSdkError, Message} from '@ai-toolkit/ai/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'
import {SessionId} from '#rpcs/sessions/contracts.ts'

export class AiContracts extends RpcGroup.make(
	Rpc.make('listMessages', {
		stream: true,
		payload: {sessionId: SessionId},
		success: Schema.Array(Message)
	}),
	Rpc.make('sendMessage', {
		payload: {sessionId: SessionId, prompt: AiInput.fields.prompt, model: AiInput.fields.model},
		success: SessionId,
		error: AiSdkError
	})
)
	.prefix('ai.')
	.middleware(AuthMiddleware) {}
