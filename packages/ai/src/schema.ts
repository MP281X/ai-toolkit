import {Array, Option, Predicate, pipe, Schema, Stream, SubscriptionRef} from 'effect'

import {ModelSelection} from './catalog.ts'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.NonEmptyString)
}) {}

export class TextPart extends Schema.TaggedClass<TextPart>()('text', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
}) {}

export class ReasoningPart extends Schema.TaggedClass<ReasoningPart>()('reasoning', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
}) {}

export class FilePart extends Schema.TaggedClass<FilePart>()('file', {
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: pipe(
		Schema.NonEmptyString,
		Schema.withConstructorDefault(() => Option.some('attachment'))
	)
}) {}

export class ToolCallPart extends Schema.TaggedClass<ToolCallPart>()('tool-call', {
	toolCallId: pipe(
		Schema.NonEmptyString,
		Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))
	),
	toolName: Schema.NonEmptyString,
	input: Schema.Any
}) {}

export class ToolApprovalRequestPart extends Schema.TaggedClass<ToolApprovalRequestPart>()('tool-approval-request', {
	approvalId: pipe(
		Schema.NonEmptyString,
		Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))
	),
	toolCallId: pipe(
		Schema.NonEmptyString,
		Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))
	)
}) {}

export class ToolApprovalResponsePart extends Schema.TaggedClass<ToolApprovalResponsePart>()('tool-approval-response', {
	approvalId: Schema.NonEmptyString,
	approved: Schema.Boolean
}) {}

export class ToolResultPart extends Schema.TaggedClass<ToolResultPart>()('tool-result', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	output: Schema.Any
}) {}

export class ToolErrorPart extends Schema.TaggedClass<ToolErrorPart>()('tool-error', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	error: Schema.Unknown
}) {}

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	error: Schema.Defect
}) {}

export type UserMessagePart = typeof UserMessagePart.Type
export const UserMessagePart = Schema.Union([TextPart, FilePart])

export type ToolMessagePart = typeof ToolMessagePart.Type
export const ToolMessagePart = Schema.Union([ToolResultPart, ToolApprovalResponsePart])

export type AssistantMessagePart = typeof AssistantMessagePart.Type
export const AssistantMessagePart = Schema.Union([
	TextPart,
	ReasoningPart,
	FilePart,
	ToolCallPart,
	ToolApprovalRequestPart,
	ToolResultPart,
	ToolErrorPart,
	ErrorPart
])

export type MessagePart = typeof MessagePart.Type
export const MessagePart = Schema.Union([UserMessagePart, AssistantMessagePart, ToolMessagePart])

export class StartPart extends Schema.TaggedClass<StartPart>()('start', {
	model: ModelSelection,
	startedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now()))),
	role: Schema.Literals(['user', 'assistant', 'tool'])
}) {}

export class FinishPart extends Schema.TaggedClass<FinishPart>()('finish', {
	finishReason: pipe(
		Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']),
		Schema.withConstructorDefault(() => Option.some('stop' as const))
	),
	usage: pipe(
		Schema.Struct({input: Schema.Number, output: Schema.Number, reasoning: Schema.Number}),
		Schema.withConstructorDefault(() => Option.some({input: 0, output: 0, reasoning: 0}))
	)
}) {}

export type MessageStreamPart = typeof MessageStreamPart.Type
export const MessageStreamPart = Schema.Union([StartPart, MessagePart, FinishPart])

export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
	model: ModelSelection,
	startedAt: StartPart.fields.startedAt,
	role: StartPart.fields.role,
	parts: Schema.Array(MessagePart),
	finishReason: FinishPart.fields.finishReason,
	usage: FinishPart.fields.usage
}) {}

export function upsertConversationMessage(messages: readonly ConversationMessage[], message: ConversationMessage) {
	const previous = messages[messages.length - 1]
	if (Predicate.isUndefined(previous)) return Array.append(messages, message)
	if (previous.startedAt !== message.startedAt || previous.role !== message.role) return [...messages, message]
	return [...messages.slice(0, -1), message]
}

export function partsStreamToMessage<E, R>(stream: Stream.Stream<MessageStreamPart, E, R>) {
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

			if (part._tag === 'text' || part._tag === 'reasoning') {
				const lastPart = current.parts[current.parts.length - 1]
				if (lastPart?._tag === part._tag && lastPart.id === part.id) {
					const mergedPart =
						part._tag === 'text'
							? new TextPart({id: part.id, text: lastPart.text + part.text})
							: new ReasoningPart({id: part.id, text: lastPart.text + part.text})
					return new ConversationMessage({...current, parts: [...current.parts.slice(0, -1), mergedPart]})
				}
			}

			return new ConversationMessage({...current, parts: Array.append(current.parts, part)})
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}

export function partsStreamWithStartFinish(
	selection: ModelSelection,
	role: StartPart['role'],
	parts: readonly MessageStreamPart[]
) {
	return Stream.concat(
		Stream.succeed(new StartPart({model: selection, role})),
		Stream.concat(Stream.fromIterable(parts), Stream.succeed(new FinishPart({})))
	)
}

export function applyPartsStream<E, R>(
	events: SubscriptionRef.SubscriptionRef<MessageStreamPart | undefined>,
	history: SubscriptionRef.SubscriptionRef<ConversationMessage[]>,
	stream: Stream.Stream<MessageStreamPart, E, R>
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
