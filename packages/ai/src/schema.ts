import {Option, PubSub, pipe, Ref, Schema, Stream} from 'effect'

import {ModelSelection} from './catalog.ts'
import {NormalizedToolInput, NormalizedToolOutput, ToolKind} from './tools.ts'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Unknown),
	message: Schema.optional(Schema.NonEmptyString)
}) {}

export const Usage = Schema.Struct({
	input: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
	output: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
	reasoning: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0)))
})
export type Usage = typeof Usage.Type

export const MessageRole = Schema.Literals(['user', 'assistant'])
export type MessageRole = typeof MessageRole.Type

export const MessageState = Schema.Literals(['streaming', 'awaiting-response', 'complete', 'error'])
export type MessageState = typeof MessageState.Type

export const FinishReason = Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])
export type FinishReason = typeof FinishReason.Type

export const ApprovalDecision = Schema.Literals(['approve', 'deny'])
export type ApprovalDecision = typeof ApprovalDecision.Type

export const ToolState = Schema.Literals([
	'running',
	'pending-approval',
	'pending-user-input',
	'success',
	'error',
	'denied'
])
export type ToolState = typeof ToolState.Type

export const PromptTextPart = Schema.TaggedStruct('text', {
	text: Schema.String
})
export type PromptTextPart = typeof PromptTextPart.Type

export const PromptFilePart = Schema.TaggedStruct('file', {
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some('attachment')))
})
export type PromptFilePart = typeof PromptFilePart.Type

export const PromptPart = Schema.Union([PromptTextPart, PromptFilePart])
export type PromptPart = typeof PromptPart.Type

export const MessageStartEvent = Schema.TaggedStruct('message-start', {
	messageId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	model: ModelSelection,
	role: MessageRole,
	startedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now())))
})
export type MessageStartEvent = typeof MessageStartEvent.Type

export const MessageFinishEvent = Schema.TaggedStruct('message-finish', {
	messageId: Schema.NonEmptyString,
	finishReason: FinishReason.pipe(Schema.withConstructorDefault(() => Option.some('stop'))),
	finishedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now()))),
	usage: Usage.pipe(Schema.withConstructorDefault(() => Option.some(Usage.makeUnsafe({}))))
})
export type MessageFinishEvent = typeof MessageFinishEvent.Type

export const TextDeltaEvent = Schema.TaggedStruct('text-delta', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	text: Schema.String
})
export type TextDeltaEvent = typeof TextDeltaEvent.Type

export const ReasoningDeltaEvent = Schema.TaggedStruct('reasoning-delta', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	kind: Schema.optional(Schema.String),
	text: Schema.String
})
export type ReasoningDeltaEvent = typeof ReasoningDeltaEvent.Type

export const FileEvent = Schema.TaggedStruct('file', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some('attachment')))
})
export type FileEvent = typeof FileEvent.Type

export const ToolCallEvent = Schema.TaggedStruct('tool-call', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	requestId: Schema.optional(Schema.NonEmptyString),
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	state: Schema.Literals(['running', 'pending-user-input']),
	input: Schema.optional(NormalizedToolInput)
})
export type ToolCallEvent = typeof ToolCallEvent.Type

export const ToolApprovalRequestEvent = Schema.TaggedStruct('tool-approval-request', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	approvalId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	input: Schema.optional(NormalizedToolInput)
})
export type ToolApprovalRequestEvent = typeof ToolApprovalRequestEvent.Type

export const ToolApprovalResponseEvent = Schema.TaggedStruct('tool-approval-response', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	approvalId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	decision: ApprovalDecision
})
export type ToolApprovalResponseEvent = typeof ToolApprovalResponseEvent.Type

export const ToolResultEvent = Schema.TaggedStruct('tool-result', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	requestId: Schema.optional(Schema.NonEmptyString),
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	output: Schema.optional(NormalizedToolOutput)
})
export type ToolResultEvent = typeof ToolResultEvent.Type

export const ToolErrorEvent = Schema.TaggedStruct('tool-error', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	error: Schema.Unknown
})
export type ToolErrorEvent = typeof ToolErrorEvent.Type

export const MessageErrorEvent = Schema.TaggedStruct('message-error', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	error: Schema.Unknown
})
export type MessageErrorEvent = typeof MessageErrorEvent.Type

export const ConversationEvent = Schema.Union([
	MessageStartEvent,
	MessageFinishEvent,
	TextDeltaEvent,
	ReasoningDeltaEvent,
	FileEvent,
	ToolCallEvent,
	ToolApprovalRequestEvent,
	ToolApprovalResponseEvent,
	ToolResultEvent,
	ToolErrorEvent,
	MessageErrorEvent
])
export type ConversationEvent = typeof ConversationEvent.Type

export const TextPart = Schema.TaggedStruct('text', {
	id: Schema.NonEmptyString,
	text: Schema.String
})
export type TextPart = typeof TextPart.Type

export const ReasoningPart = Schema.TaggedStruct('reasoning', {
	id: Schema.NonEmptyString,
	kind: Schema.optional(Schema.String),
	text: Schema.String
})
export type ReasoningPart = typeof ReasoningPart.Type

export const FilePart = Schema.TaggedStruct('file', {
	id: Schema.NonEmptyString,
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: Schema.NonEmptyString
})
export type FilePart = typeof FilePart.Type

export const ToolPart = Schema.TaggedStruct('tool', {
	id: Schema.NonEmptyString,
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	requestId: Schema.optional(Schema.NonEmptyString),
	approvalId: Schema.optional(Schema.NonEmptyString),
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	state: ToolState,
	input: Schema.optional(NormalizedToolInput),
	output: Schema.optional(NormalizedToolOutput),
	error: Schema.optional(Schema.Unknown)
})
export type ToolPart = typeof ToolPart.Type

export const ErrorPart = Schema.TaggedStruct('error', {
	id: Schema.NonEmptyString,
	error: Schema.Unknown
})
export type ErrorPart = typeof ErrorPart.Type

export const ConversationMessagePart = Schema.Union([TextPart, ReasoningPart, FilePart, ToolPart, ErrorPart])
export type ConversationMessagePart = typeof ConversationMessagePart.Type

export const ConversationMessage = Schema.Struct({
	id: Schema.NonEmptyString,
	model: ModelSelection,
	role: MessageRole,
	startedAt: Schema.Number,
	finishedAt: Schema.optional(Schema.Number),
	state: MessageState.pipe(Schema.withConstructorDefault(() => Option.some('streaming'))),
	finishReason: Schema.optional(FinishReason),
	usage: Usage.pipe(Schema.withConstructorDefault(() => Option.some(Usage.makeUnsafe({})))),
	parts: Schema.Array(ConversationMessagePart).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type ConversationMessage = typeof ConversationMessage.Type

export const ToolResponse = Schema.Union([ToolApprovalResponseEvent, ToolResultEvent])
export type ToolResponse = typeof ToolResponse.Type

export function appendConversationEvent(messages: readonly ConversationMessage[], event: ConversationEvent) {
	if (event._tag === 'message-start') {
		if (messages.findLastIndex(candidate => candidate.id === event.messageId) !== -1) {
			return messages
		}
		return [
			...messages,
			ConversationMessage.makeUnsafe({
				id: event.messageId,
				model: event.model,
				role: event.role,
				startedAt: event.startedAt
			})
		] as const
	}

	const messageIndex = messages.findLastIndex(candidate => candidate.id === event.messageId)
	if (messageIndex === -1) {
		return messages
	}

	const message = messages[messageIndex]
	if (message === undefined) {
		return messages
	}

	if (event._tag === 'message-finish') {
		let state: MessageState = 'complete'
		if (event.finishReason === 'tool-calls') {
			state = 'awaiting-response'
		}
		if (event.finishReason === 'error') {
			state = 'error'
		}
		return messages.map((candidate, index) =>
			index !== messageIndex
				? candidate
				: ConversationMessage.makeUnsafe({
						...message,
						finishedAt: event.finishedAt,
						finishReason: event.finishReason,
						state,
						usage: event.usage
					})
		)
	}

	if (event._tag === 'text-delta') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'text' && part.id === event.partId)
		const parts =
			partIndex === -1
				? [...message.parts, TextPart.makeUnsafe({id: event.partId, text: event.text})]
				: message.parts.map((part, index) =>
						index !== partIndex || part._tag !== 'text'
							? part
							: TextPart.makeUnsafe({id: event.partId, text: `${part.text}${event.text}`})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'reasoning-delta') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'reasoning' && part.id === event.partId)
		const parts =
			partIndex === -1
				? [...message.parts, ReasoningPart.makeUnsafe({id: event.partId, kind: event.kind, text: event.text})]
				: message.parts.map((part, index) =>
						index !== partIndex || part._tag !== 'reasoning'
							? part
							: ReasoningPart.makeUnsafe({id: event.partId, kind: part.kind, text: `${part.text}${event.text}`})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'file') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'file' && part.id === event.partId)
		const parts =
			partIndex === -1
				? [
						...message.parts,
						FilePart.makeUnsafe({
							id: event.partId,
							data: event.data,
							mediaType: event.mediaType,
							filename: event.filename
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || part._tag !== 'file'
							? part
							: FilePart.makeUnsafe({
									id: event.partId,
									data: event.data,
									mediaType: event.mediaType,
									filename: event.filename
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'tool-call') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'tool' && part.toolCallId === event.toolCallId)
		const previousPart = partIndex === -1 ? undefined : message.parts[partIndex]
		const parts =
			partIndex === -1
				? [
						...message.parts,
						ToolPart.makeUnsafe({
							id: event.partId,
							messageId: event.messageId,
							toolCallId: event.toolCallId,
							requestId: event.requestId,
							toolName: event.toolName,
							toolKind: event.toolKind,
							state: event.state,
							input: event.input
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || previousPart?._tag !== 'tool'
							? part
							: ToolPart.makeUnsafe({
									approvalId: previousPart.approvalId,
									error: previousPart.error,
									id: event.partId,
									input: event.input,
									messageId: event.messageId,
									output: previousPart.output,
									requestId: event.requestId ?? previousPart.requestId,
									state: event.state,
									toolCallId: event.toolCallId,
									toolKind: event.toolKind,
									toolName: event.toolName
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'tool-approval-request') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'tool' && part.toolCallId === event.toolCallId)
		const previousPart = partIndex === -1 ? undefined : message.parts[partIndex]
		const parts =
			partIndex === -1
				? [
						...message.parts,
						ToolPart.makeUnsafe({
							approvalId: event.approvalId,
							id: event.partId,
							input: event.input,
							messageId: event.messageId,
							requestId: previousPart?._tag === 'tool' ? previousPart.requestId : undefined,
							state: 'pending-approval',
							toolCallId: event.toolCallId,
							toolKind: event.toolKind,
							toolName: event.toolName
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || previousPart?._tag !== 'tool'
							? part
							: ToolPart.makeUnsafe({
									approvalId: event.approvalId,
									error: previousPart.error,
									id: event.partId,
									input: event.input ?? previousPart.input,
									messageId: event.messageId,
									output: previousPart.output,
									requestId: previousPart.requestId,
									state: 'pending-approval',
									toolCallId: event.toolCallId,
									toolKind: event.toolKind,
									toolName: event.toolName
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'tool-approval-response') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'tool' && part.toolCallId === event.toolCallId)
		const previousPart = partIndex === -1 ? undefined : message.parts[partIndex]
		const parts =
			partIndex === -1
				? [
						...message.parts,
						ToolPart.makeUnsafe({
							approvalId: event.approvalId,
							id: event.partId,
							messageId: event.messageId,
							requestId: previousPart?._tag === 'tool' ? previousPart.requestId : undefined,
							state: event.decision === 'deny' ? 'denied' : 'running',
							toolCallId: event.toolCallId,
							toolKind: event.toolKind,
							toolName: event.toolName
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || previousPart?._tag !== 'tool'
							? part
							: ToolPart.makeUnsafe({
									approvalId: event.approvalId,
									error: previousPart.error,
									id: event.partId,
									input: previousPart.input,
									messageId: event.messageId,
									output: previousPart.output,
									requestId: previousPart.requestId,
									state: event.decision === 'deny' ? 'denied' : 'running',
									toolCallId: event.toolCallId,
									toolKind: event.toolKind,
									toolName: event.toolName
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'tool-result') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'tool' && part.toolCallId === event.toolCallId)
		const previousPart = partIndex === -1 ? undefined : message.parts[partIndex]
		const parts =
			partIndex === -1
				? [
						...message.parts,
						ToolPart.makeUnsafe({
							id: event.partId,
							messageId: event.messageId,
							output: event.output,
							requestId: event.requestId,
							state: 'success',
							toolCallId: event.toolCallId,
							toolKind: event.toolKind,
							toolName: event.toolName
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || previousPart?._tag !== 'tool'
							? part
							: ToolPart.makeUnsafe({
									approvalId: previousPart.approvalId,
									error: undefined,
									id: event.partId,
									input: previousPart.input,
									messageId: event.messageId,
									output: event.output,
									requestId: event.requestId ?? previousPart.requestId,
									state: 'success',
									toolCallId: event.toolCallId,
									toolKind: event.toolKind,
									toolName: event.toolName
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts})
		)
	}

	if (event._tag === 'tool-error') {
		const partIndex = message.parts.findLastIndex(part => part._tag === 'tool' && part.toolCallId === event.toolCallId)
		const previousPart = partIndex === -1 ? undefined : message.parts[partIndex]
		const parts =
			partIndex === -1
				? [
						...message.parts,
						ToolPart.makeUnsafe({
							error: event.error,
							id: event.partId,
							messageId: event.messageId,
							requestId: previousPart?._tag === 'tool' ? previousPart.requestId : undefined,
							state: 'error',
							toolCallId: event.toolCallId,
							toolKind: event.toolKind,
							toolName: event.toolName
						})
					]
				: message.parts.map((part, index) =>
						index !== partIndex || previousPart?._tag !== 'tool'
							? part
							: ToolPart.makeUnsafe({
									approvalId: previousPart.approvalId,
									error: event.error,
									id: event.partId,
									input: previousPart.input,
									messageId: event.messageId,
									output: previousPart.output,
									requestId: previousPart.requestId,
									state: 'error',
									toolCallId: event.toolCallId,
									toolKind: event.toolKind,
									toolName: event.toolName
								})
					)
		return messages.map((candidate, index) =>
			index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts, state: 'error'})
		)
	}

	const parts = [...message.parts, ErrorPart.makeUnsafe({id: event.partId, error: event.error})]
	return messages.map((candidate, index) =>
		index !== messageIndex ? candidate : ConversationMessage.makeUnsafe({...message, parts, state: 'error'})
	)
}

export function reconstructMessages(events: readonly ConversationEvent[]) {
	return events.reduce<readonly ConversationMessage[]>(appendConversationEvent, [])
}

export function createPromptEvents(input: {model: ModelSelection; parts: readonly PromptPart[]}) {
	const messageId = crypto.randomUUID()

	return [
		MessageStartEvent.makeUnsafe({messageId, model: input.model, role: 'user'}),
		...input.parts.map(part =>
			part._tag === 'text'
				? TextDeltaEvent.makeUnsafe({messageId, partId: crypto.randomUUID(), text: part.text})
				: FileEvent.makeUnsafe({
						data: part.data,
						filename: part.filename,
						mediaType: part.mediaType,
						messageId,
						partId: crypto.randomUUID()
					})
		),
		MessageFinishEvent.makeUnsafe({messageId, finishReason: 'stop', usage: Usage.makeUnsafe({})})
	] as const satisfies readonly ConversationEvent[]
}

export function publishConversationEventStream<E, R>(
	history: Ref.Ref<readonly ConversationMessage[]>,
	events: PubSub.PubSub<ConversationEvent>,
	stream: Stream.Stream<ConversationEvent, E, R>
) {
	return pipe(
		stream,
		Stream.tap(event => Ref.update(history, messages => appendConversationEvent(messages, event))),
		Stream.tap(event => PubSub.publish(events, event)),
		Stream.runDrain
	)
}
