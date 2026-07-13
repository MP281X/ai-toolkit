import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type Team = typeof Team.Type
const Integer = Schema.Number.check(Schema.isInt())
const Team = Schema.Struct({count: Integer, id: Schema.String, name: Schema.NonEmptyString, order: Integer})
export const TeamSnapshot = Schema.Array(Team)

export class CommandError extends Schema.TaggedErrorClass<CommandError>()('CommandError', {message: Schema.String}) {}

const Credentials = {password: Schema.String, username: Schema.String}

export class RpcContracts extends RpcGroup.make(
	Rpc.make('teams', {stream: true, success: TeamSnapshot}),
	Rpc.make('teams.adjust', {
		error: CommandError,
		payload: Schema.Struct({...Credentials, amount: Integer, id: Schema.String}),
		success: TeamSnapshot
	}),
	Rpc.make('teams.add', {
		error: CommandError,
		payload: Schema.Struct({...Credentials, name: Schema.String}),
		success: TeamSnapshot
	}),
	Rpc.make('teams.rename', {
		error: CommandError,
		payload: Schema.Struct({...Credentials, id: Schema.String, name: Schema.String}),
		success: TeamSnapshot
	}),
	Rpc.make('teams.remove', {
		error: CommandError,
		payload: Schema.Struct({...Credentials, id: Schema.String}),
		success: TeamSnapshot
	})
) {}
