import {Schema} from 'effect'

import {Rpc, RpcGroup, RpcMiddleware} from 'effect/unstable/rpc'

export type Team = typeof Team.Type
export const Team = Schema.Struct({
	count: Schema.Int,
	createdOrder: Schema.Int,
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString
})

export type CounterState = typeof CounterState.Type
export const CounterState = Schema.Struct({teams: Schema.Array(Team)})

export type CounterSnapshot = typeof CounterSnapshot.Type
export const CounterSnapshot = Schema.TaggedStruct('CounterSnapshot', {state: CounterState})

export type CounterChanged = typeof CounterChanged.Type
export const CounterChanged = Schema.TaggedStruct('CounterChanged', {state: CounterState})

export class CounterError extends Schema.TaggedErrorClass<CounterError>()('CounterError', {
	message: Schema.String,
	reason: Schema.Literals(['auth', 'validation'])
}) {}

export class AdminSession extends RpcMiddleware.Service<AdminSession>()('beer-counter/AdminSession', {
	error: CounterError
}) {}

const AdminAdjust = Rpc.make('admin.adjust', {
	error: CounterError,
	payload: Schema.Struct({amount: Schema.Number, direction: Schema.Literals(['add', 'subtract']), id: Schema.String})
}).middleware(AdminSession)

const AdminAdd = Rpc.make('admin.add', {error: CounterError, payload: Schema.Struct({name: Schema.String})}).middleware(
	AdminSession
)

const AdminRename = Rpc.make('admin.rename', {
	error: CounterError,
	payload: Schema.Struct({id: Schema.String, name: Schema.String})
}).middleware(AdminSession)

const AdminRemove = Rpc.make('admin.remove', {
	error: CounterError,
	payload: Schema.Struct({id: Schema.String})
}).middleware(AdminSession)

export class RpcContracts extends RpcGroup.make(
	Rpc.make('counter.watch', {stream: true, success: Schema.Union([CounterSnapshot, CounterChanged])}),
	AdminAdjust,
	AdminAdd,
	AdminRename,
	AdminRemove
) {}
