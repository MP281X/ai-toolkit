import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

export type Team = typeof Team.Type
export const Team = Schema.Struct({
	count: NonNegativeInt,
	createdAt: NonNegativeInt,
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString
})

export type BeerCounterState = typeof BeerCounterState.Type
export const BeerCounterState = Schema.Struct({teams: Schema.Array(Team)})

export class CommandError extends Schema.TaggedErrorClass<CommandError>()('CommandError', {message: Schema.String}) {}

const Credentials = Schema.Struct({password: Schema.String, username: Schema.String})
const TeamCommand = Schema.Struct({id: Schema.NonEmptyString, password: Schema.String, username: Schema.String})

export class RpcContracts extends RpcGroup.make(
	Rpc.make('scoreboard.watch', {stream: true, success: BeerCounterState}),
	Rpc.make('admin.authenticate', {error: CommandError, payload: Credentials}),
	Rpc.make('teams.adjust', {
		error: CommandError,
		payload: Schema.Struct({
			amount: PositiveInt,
			direction: Schema.Literals(['add', 'subtract']),
			id: Schema.NonEmptyString,
			password: Schema.String,
			username: Schema.String
		}),
		success: BeerCounterState
	}),
	Rpc.make('teams.add', {
		error: CommandError,
		payload: Schema.Struct({name: Schema.String, password: Schema.String, username: Schema.String}),
		success: BeerCounterState
	}),
	Rpc.make('teams.rename', {
		error: CommandError,
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.String,
			password: Schema.String,
			username: Schema.String
		}),
		success: BeerCounterState
	}),
	Rpc.make('teams.remove', {error: CommandError, payload: TeamCommand, success: BeerCounterState})
) {}
