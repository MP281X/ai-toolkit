import {Predicate, pipe, Schema, Stream} from 'effect'

import {ModelSelection} from './catalog.ts'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class TextPart extends Schema.TaggedClass<TextPart>()('text-part', {
	text: Schema.String,
	id: Schema.optional(Schema.String)
}) {}

export class ReasoningPart extends Schema.TaggedClass<ReasoningPart>()('reasoning-part', {
	text: Schema.String,
	id: Schema.optional(Schema.String)
}) {}

export class FilePart extends Schema.TaggedClass<FilePart>()('file-part', {
	data: Schema.String,
	mediaType: Schema.String,
	filename: Schema.optional(Schema.String)
}) {}

export class ToolCallPart extends Schema.TaggedClass<ToolCallPart>()('tool-call', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown
}) {}

export class ToolApprovalRequestPart extends Schema.TaggedClass<ToolApprovalRequestPart>()('tool-approval-request', {
	approvalId: Schema.String,
	toolCallId: Schema.String
}) {}

export class ToolApprovalResponsePart extends Schema.TaggedClass<ToolApprovalResponsePart>()('tool-approval-response', {
	approvalId: Schema.String,
	approved: Schema.Boolean,
	reason: Schema.optional(Schema.String),
	providerExecuted: Schema.optional(Schema.Boolean)
}) {}

export class ToolOutputDeniedPart extends Schema.TaggedClass<ToolOutputDeniedPart>()('tool-output-denied', {
	toolCallId: Schema.String,
	toolName: Schema.String
}) {}

export class ToolResultPart extends Schema.TaggedClass<ToolResultPart>()('tool-result', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	output: Schema.Unknown
}) {}

export class ToolResultResponsePart extends Schema.TaggedClass<ToolResultResponsePart>()('tool-result-response', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	output: Schema.Unknown
}) {}

export class ToolErrorPart extends Schema.TaggedClass<ToolErrorPart>()('tool-error', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	error: Schema.Unknown
}) {}

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	error: Schema.Defect
}) {}

export type UserContentPart = typeof UserContentPart.Type
export const UserContentPart = Schema.Union([TextPart, FilePart])

export type ToolResponsePart = typeof ToolResponsePart.Type
export const ToolResponsePart = Schema.Union([ToolResultResponsePart, ToolApprovalResponsePart])

export type ContentPart = typeof ContentPart.Type
export const ContentPart = Schema.Union([
	TextPart,
	ReasoningPart,
	FilePart,
	ToolCallPart,
	ToolApprovalRequestPart,
	ToolApprovalResponsePart,
	ToolOutputDeniedPart,
	ToolResultPart,
	ToolResultResponsePart,
	ToolErrorPart,
	ErrorPart
])

export class Start extends Schema.TaggedClass<Start>()('start', {
	model: ModelSelection,
	startedAt: Schema.Number,
	role: Schema.Literals(['user', 'assistant', 'system', 'tool'])
}) {}

export class Finish extends Schema.TaggedClass<Finish>()('finish', {
	finishReason: Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']),
	usage: Schema.Struct({input: Schema.Number, output: Schema.Number, reasoning: Schema.Number})
}) {}

export type StreamPart = typeof StreamPart.Type
export const StreamPart = Schema.Union([Start, ContentPart, Finish])

export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
	model: ModelSelection,
	startedAt: Schema.Number,
	role: Start.fields.role,
	parts: Schema.Array(ContentPart),
	finishReason: Schema.optional(Finish.fields.finishReason),
	usage: Schema.optional(Schema.Struct({input: Schema.Number, output: Schema.Number, reasoning: Schema.Number}))
}) {}

function appendPart(parts: readonly ContentPart[], part: ContentPart) {
	const lastPart = parts[parts.length - 1]
	if (part._tag === 'text-part' && lastPart?._tag === 'text-part' && lastPart.id === part.id) {
		return [...parts.slice(0, -1), new TextPart({id: part.id, text: lastPart.text + part.text})]
	}

	if (part._tag === 'reasoning-part' && lastPart?._tag === 'reasoning-part' && lastPart.id === part.id) {
		return [...parts.slice(0, -1), new ReasoningPart({id: part.id, text: lastPart.text + part.text})]
	}

	return [...parts, part]
}

export function partsStreamToMessage<E, R>(stream: Stream.Stream<StreamPart, E, R>) {
	return pipe(
		Stream.scan(stream, undefined as ConversationMessage | undefined, (current, part) => {
			if (part._tag === 'start') {
				return new ConversationMessage({model: part.model, startedAt: part.startedAt, role: part.role, parts: []})
			}

			if (part._tag === 'finish') {
				if (Predicate.isUndefined(current)) return current
				return new ConversationMessage({...current, finishReason: part.finishReason, usage: part.usage})
			}

			if (Predicate.isUndefined(current)) return current
			return new ConversationMessage({...current, parts: appendPart(current.parts, part)})
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}
