import {Array, Option, Predicate, pipe, Schema, Stream, SubscriptionRef} from 'effect'

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
	approved: Schema.Boolean
}) {}

export class ToolResultPart extends Schema.TaggedClass<ToolResultPart>()('tool-result', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	output: Schema.Unknown
}) {}

export class ToolErrorPart extends Schema.TaggedClass<ToolErrorPart>()('tool-error', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	error: Schema.Unknown
}) {}

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	error: Schema.Defect
}) {}

export type UserContentPart = typeof UserContentPart.Type
export const UserContentPart = Schema.Union([TextPart, FilePart])

export type ToolResponsePart = typeof ToolResponsePart.Type
export const ToolResponsePart = Schema.Union([ToolResultPart, ToolApprovalResponsePart])

export type ContentPart = typeof ContentPart.Type
export const ContentPart = Schema.Union([
	TextPart,
	ReasoningPart,
	FilePart,
	ToolCallPart,
	ToolApprovalRequestPart,
	ToolApprovalResponsePart,
	ToolResultPart,
	ToolErrorPart,
	ErrorPart
])

export class Start extends Schema.TaggedClass<Start>()('start', {
	model: ModelSelection,
	startedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now()))),
	role: Schema.Literals(['user', 'assistant', 'system', 'tool'])
}) {}

export class Finish extends Schema.TaggedClass<Finish>()('finish', {
	finishReason: pipe(
		Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']),
		Schema.withConstructorDefault(() => Option.some('stop' as const))
	),
	usage: pipe(
		Schema.Struct({input: Schema.Number, output: Schema.Number, reasoning: Schema.Number}),
		Schema.withConstructorDefault(() => Option.some({input: 0, output: 0, reasoning: 0}))
	)
}) {}

export type StreamPart = typeof StreamPart.Type
export const StreamPart = Schema.Union([Start, ContentPart, Finish])

export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
	model: ModelSelection,
	startedAt: Start.fields.startedAt,
	role: Start.fields.role,
	parts: Schema.Array(ContentPart),
	finishReason: Finish.fields.finishReason,
	usage: Finish.fields.usage
}) {}

export function upsertConversationMessage(messages: readonly ConversationMessage[], message: ConversationMessage) {
	const previous = messages[messages.length - 1]
	if (Predicate.isUndefined(previous)) return Array.append(messages, message)
	if (previous.startedAt !== message.startedAt || previous.role !== message.role) return [...messages, message]
	return [...messages.slice(0, -1), message]
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

			if (part._tag === 'text-part') {
				const lastPart = current.parts[current.parts.length - 1]
				if (lastPart?._tag === 'text-part' && lastPart.id === part.id)
					return new ConversationMessage({
						...current,
						parts: [...current.parts.slice(0, -1), new TextPart({id: part.id, text: lastPart.text + part.text})]
					})
			}

			if (part._tag === 'reasoning-part') {
				const lastPart = current.parts[current.parts.length - 1]
				if (lastPart?._tag === 'reasoning-part' && lastPart.id === part.id)
					return new ConversationMessage({
						...current,
						parts: [...current.parts.slice(0, -1), new ReasoningPart({id: part.id, text: lastPart.text + part.text})]
					})
			}

			return new ConversationMessage({...current, parts: Array.append(current.parts, part)})
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}

export function partsStreamWithStartFinish(
	selection: ModelSelection,
	role: Start['role'],
	parts: readonly StreamPart[]
) {
	return Stream.concat(
		Stream.succeed(new Start({model: selection, role})),
		Stream.concat(Stream.fromIterable(parts), Stream.succeed(new Finish({})))
	)
}

export function applyPartsStream<E, R>(
	events: SubscriptionRef.SubscriptionRef<StreamPart | undefined>,
	history: SubscriptionRef.SubscriptionRef<ConversationMessage[]>,
	stream: Stream.Stream<StreamPart, E, R>
) {
	return pipe(
		stream,
		Stream.tap(part => SubscriptionRef.set(events, part)),
		partsStreamToMessage,
		Stream.mapEffect(message =>
			SubscriptionRef.update(history, current => upsertConversationMessage(current, message))
		),
		Stream.runDrain
	)
}
