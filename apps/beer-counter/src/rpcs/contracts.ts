import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type Team = typeof Team.Type
export const Team = Schema.Struct({
	count: Schema.Number,
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString,
	order: Schema.Number
})

export type CounterState = typeof CounterState.Type
export const CounterState = Schema.Struct({teams: Schema.Array(Team)})

export type CounterSnapshot = typeof CounterSnapshot.Type
export const CounterSnapshot = Schema.TaggedStruct('snapshot', {teams: Schema.Array(Team)})

export type CounterChanged = typeof CounterChanged.Type
export const CounterChanged = Schema.TaggedStruct('changed', {teams: Schema.Array(Team)})

const CounterEvent = Schema.Union([CounterSnapshot, CounterChanged])
export type CounterEvent = typeof CounterEvent.Type

export class CounterError extends Schema.TaggedErrorClass<CounterError>()('CounterError', {
	message: Schema.String,
	reason: Schema.Literals(['auth', 'validation', 'storage'] as const)
}) {}

const CredentialsFields = {password: Schema.String, username: Schema.String} as const

export class RpcContracts extends RpcGroup.make(
	Rpc.make('counter.watch', {stream: true, success: CounterEvent}),
	Rpc.make('counter.add', {error: CounterError, payload: Schema.Struct({...CredentialsFields, name: Schema.String})}),
	Rpc.make('counter.rename', {
		error: CounterError,
		payload: Schema.Struct({...CredentialsFields, id: Schema.NonEmptyString, name: Schema.String})
	}),
	Rpc.make('counter.remove', {
		error: CounterError,
		payload: Schema.Struct({...CredentialsFields, id: Schema.NonEmptyString})
	}),
	Rpc.make('counter.adjust', {
		error: CounterError,
		payload: Schema.Struct({
			...CredentialsFields,
			amount: Schema.Number,
			direction: Schema.Literals(['add', 'subtract'] as const),
			id: Schema.NonEmptyString
		})
	})
) {}
