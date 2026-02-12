import {Rpc, RpcGroup} from '@effect/rpc'
import {pipe, Schema} from 'effect'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export type UserId = typeof UserId.Type
export const UserId = pipe(Schema.String, Schema.brand('UserId'))

export type SessionId = typeof SessionId.Type
export const SessionId = pipe(Schema.String, Schema.brand('SessionId'))

export class SessionItem extends Schema.Class<SessionItem>('SessionItem')({
	id: SessionId,
	name: Schema.String
}) {}

export class SessionsContracts extends RpcGroup.make(
	Rpc.make('list', {
		stream: true,
		success: Schema.Array(SessionItem)
	}),
	Rpc.make('add', {
		payload: {name: Schema.String, sessionId: Schema.optional(SessionId)}
	}),
	Rpc.make('remove', {
		payload: {sessionId: SessionId}
	})
)
	.prefix('sessions.')
	.middleware(AuthMiddleware) {}
