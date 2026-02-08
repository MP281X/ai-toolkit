import {Rpc, RpcGroup} from '@effect/rpc'
import {Effect, Schema, SubscriptionRef} from 'effect'

import {Message} from '@ai-toolkit/ai'

import {AuthMiddleware} from '#rpcs/middlewares.ts'

export class MessagesRpcs extends RpcGroup.make(
	Rpc.make('ListMessages', {
		success: Schema.Array(Message),
		stream: true
	})
).middleware(AuthMiddleware) {}

export const MessagesLive = MessagesRpcs.toLayer(
	Effect.gen(function* () {
		const ref = yield* SubscriptionRef.make<readonly Message[]>([])

		return MessagesRpcs.of({
			ListMessages: () => ref.changes
		})
	})
)
