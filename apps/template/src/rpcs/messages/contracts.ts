import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {Message} from '@ai-toolkit/ai/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class MessagesRpcs extends RpcGroup.make(
	Rpc.make('ListMessages', {
		success: Schema.Array(Message),
		stream: true
	})
).middleware(AuthMiddleware) {}
