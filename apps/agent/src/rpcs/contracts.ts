import {Option, pipe, Schema} from 'effect'

import {WebFetchToolKit, WebSearchToolKit} from '@ai-toolkit/ai/tools'
import {AiError, Prompt, Response, Toolkit} from 'effect/unstable/ai'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type SessionId = typeof SessionId.Type
export const SessionId = pipe(
	Schema.NonEmptyString,
	Schema.check(Schema.isUUID()),
	Schema.withConstructorDefault(() => Option.some(crypto.randomUUID())),
	Schema.brand('SessionId')
)

export type WorkspaceId = typeof WorkspaceId.Type
export const WorkspaceId = pipe(
	Schema.NonEmptyString,
	Schema.check(Schema.isUUID()),
	Schema.withConstructorDefault(() => Option.some(crypto.randomUUID())),
	Schema.brand('WorkspaceId')
)

export class Workspace extends Schema.Class<Workspace>('Workspace')({
	id: WorkspaceId,
	name: Schema.NonEmptyString,
	parentId: Schema.NullOr(WorkspaceId)
}) {}

export class Session extends Schema.Class<Session>('Session')({
	id: SessionId,
	title: Schema.String,
	workspaceId: WorkspaceId
}) {}

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({sessionId: SessionId, message: Prompt.UserMessage}),
		error: AiError.AiError
	}),
	Rpc.make('agent.stop', {
		payload: Schema.Struct({sessionId: SessionId})
	}),
	Rpc.make('agent.events', {
		payload: Schema.Struct({sessionId: SessionId}),
		stream: true,
		error: AiError.AiError,
		success: Schema.Union([Prompt.Message, Response.StreamPart(Toolkit.merge(WebSearchToolKit, WebFetchToolKit))])
	}),
	Rpc.make('agent.workspaces', {
		stream: true,
		success: Schema.Array(Workspace)
	}),
	Rpc.make('agent.sessions', {
		stream: true,
		success: Schema.Array(Session)
	}),
	Rpc.make('agent.createWorkspace', {
		payload: Schema.Struct({name: Schema.NonEmptyString, parentId: Schema.NullOr(WorkspaceId)})
	}),
	Rpc.make('agent.updateWorkspace', {
		payload: Schema.Struct({
			id: WorkspaceId,
			name: Schema.optional(Schema.NonEmptyString),
			parentId: Schema.optional(Schema.NullOr(WorkspaceId))
		})
	}),
	Rpc.make('agent.deleteWorkspace', {
		payload: Schema.Struct({id: WorkspaceId})
	}),
	Rpc.make('agent.createSession', {
		payload: Schema.Struct({id: SessionId, workspaceId: WorkspaceId})
	}),
	Rpc.make('agent.updateSession', {
		payload: Schema.Struct({id: SessionId, title: Schema.optional(Schema.String)})
	}),
	Rpc.make('agent.deleteSession', {
		payload: Schema.Struct({id: SessionId})
	})
) {}
