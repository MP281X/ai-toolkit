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

export class AdminAuthorization extends RpcMiddleware.Service<AdminAuthorization>()('beer-counter/AdminAuthorization', {
	error: CounterError
}) {}

const AuthStatus = Rpc.make('auth.status', {error: CounterError, payload: Schema.Struct({})}).middleware(
	AdminAuthorization
)

const AdminAdjust = Rpc.make('admin.adjust', {
	error: CounterError,
	payload: Schema.Struct({amount: Schema.Number, direction: Schema.Literals(['add', 'subtract']), id: Schema.String})
}).middleware(AdminAuthorization)

const AdminAdd = Rpc.make('admin.add', {error: CounterError, payload: Schema.Struct({name: Schema.String})}).middleware(
	AdminAuthorization
)

const AdminRemove = Rpc.make('admin.remove', {
	error: CounterError,
	payload: Schema.Struct({id: Schema.String})
}).middleware(AdminAuthorization)

export class RpcContracts extends RpcGroup.make(
	AuthStatus,
	Rpc.make('counter.watch', {stream: true, success: Schema.Union([CounterSnapshot, CounterChanged])}),
	AdminAdjust,
	AdminAdd,
	AdminRemove
) {}
