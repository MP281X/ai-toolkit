import {Rpc, RpcGroup} from '@effect/rpc'
import {pipe, Schema} from 'effect'

import {AiInput, AiSdkError, Message} from '@ai-toolkit/ai/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export type SessionId = typeof SessionId.Type
export const SessionId = pipe(Schema.String, Schema.brand('SessionId'))

export class AiContracts extends RpcGroup.make(
	Rpc.make('listMessages', {
		stream: true,
		payload: {sessionId: SessionId},
		success: Schema.Array(Message)
	}),
	Rpc.make('sendMessage', {
		payload: {sessionId: SessionId, ...AiInput.fields},
		error: AiSdkError
	})
)
	.prefix('ai.')
	.middleware(AuthMiddleware) {}
