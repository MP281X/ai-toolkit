import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type Team = typeof Team.Type
export const Team = Schema.Struct({
	count: Schema.Int,
	createdOrder: Schema.Int,
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString
})

export type BeerState = typeof BeerState.Type
export const BeerState = Schema.Struct({teams: Schema.Array(Team)})

export class BeerCounterError extends Schema.TaggedErrorClass<BeerCounterError>()('BeerCounterError', {
	message: Schema.String
}) {}

export type Credentials = typeof Credentials.Type
const Credentials = Schema.Struct({password: Schema.String, username: Schema.String})

export class RpcContracts extends RpcGroup.make(
	Rpc.make('beer.subscribe', {stream: true, success: BeerState}),
	Rpc.make('admin.authenticate', {error: BeerCounterError, payload: Credentials}),
	Rpc.make('admin.adjust', {
		error: BeerCounterError,
		payload: Schema.Struct({
			...Credentials.fields,
			amount: Schema.Number,
			direction: Schema.Literals(['add', 'subtract']),
			id: Schema.String
		})
	}),
	Rpc.make('admin.add', {
		error: BeerCounterError,
		payload: Schema.Struct({...Credentials.fields, name: Schema.String})
	}),
	Rpc.make('admin.rename', {
		error: BeerCounterError,
		payload: Schema.Struct({...Credentials.fields, id: Schema.String, name: Schema.String})
	}),
	Rpc.make('admin.remove', {
		error: BeerCounterError,
		payload: Schema.Struct({...Credentials.fields, id: Schema.String})
	})
) {}
