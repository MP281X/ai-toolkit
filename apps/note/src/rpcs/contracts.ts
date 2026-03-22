import {Option, pipe, Schema} from 'effect'

import {AgentToolKit} from '@ai-toolkit/ai/tools'
import {Prompt, Response} from 'effect/unstable/ai'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class NoteError extends Schema.TaggedErrorClass<NoteError>()('NoteError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export type NoteId = typeof NoteId.Type
export const NoteId = pipe(
	Schema.NonEmptyString,
	Schema.check(Schema.isUUID()),
	Schema.withConstructorDefault(() => Option.some(crypto.randomUUID())),
	Schema.brand('NoteId')
)

export class Note extends Schema.Class<Note>('Note')({
	id: NoteId,
	title: Schema.NonEmptyString,
	parts: Schema.Array(Schema.Union([Prompt.Message, Response.StreamPart(AgentToolKit)]))
}) {}

export const RpcContracts = RpcGroup.make(
	Rpc.make('note.create', {
		payload: Prompt.UserMessage,
		success: NoteId,
		error: NoteError
	}),
	Rpc.make('note.list', {
		stream: true,
		success: Schema.Array(Note),
		error: NoteError
	}),
	Rpc.make('note.delete', {
		payload: NoteId,
		error: NoteError
	})
)
