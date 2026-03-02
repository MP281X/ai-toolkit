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
	finishReason: Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']),
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
	state: pipe(
		Schema.Literals(['loading', 'stop', 'tool-calls', 'error']),
		Schema.withConstructorDefault(() => Option.some('loading' as const))
	),
	usage: FinishPart.fields.usage
}) {}

export function partsStreamToMessage<E, R>(stream: Stream.Stream<MessageStreamPart, E, R>) {
	return pipe(
		stream,
		Stream.scan(undefined as ConversationMessage | undefined, (current, part) => {
			if (part._tag === 'start') {
				return new ConversationMessage({model: part.model, startedAt: part.startedAt, role: part.role, parts: []})
			}

			if (part._tag === 'finish') {
				if (Predicate.isUndefined(current)) return current
				return new ConversationMessage({
					...current,
					usage: part.usage,
					state: part.finishReason === 'stop' || part.finishReason === 'tool-calls' ? part.finishReason : 'error'
				})
			}

			if (Predicate.isUndefined(current)) return current
			const prevPart = current.parts[current.parts.length - 1]

			if (part._tag === 'text' && prevPart?._tag === 'text' && part.id === prevPart.id) {
				return new ConversationMessage({
					...current,
					parts: [...current.parts.slice(0, -1), new TextPart({id: part.id, text: prevPart.text + part.text})]
				})
			}

			if (part._tag === 'reasoning' && prevPart?._tag === 'reasoning' && part.id === prevPart.id) {
				return new ConversationMessage({
					...current,
					parts: [...current.parts.slice(0, -1), new ReasoningPart({id: part.id, text: prevPart.text + part.text})]
				})
			}

			return new ConversationMessage({...current, parts: Array.append(current.parts, part)})
		}),
		Stream.filter(Predicate.isNotUndefined)
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
			SubscriptionRef.update(history, messages =>
				pipe(
					Array.last(messages),
					Option.filter(prev => prev.startedAt === message.startedAt && prev.role === message.role),
					Option.match({
						onNone: () => Array.append(messages, message),
						onSome: () => [...Array.dropRight(messages, 1), message]
					})
				)
			)
		),
		Stream.runDrain
	)
}
