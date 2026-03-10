import {Array, Match, Option, Predicate, pipe, Schema} from 'effect'

import {ModelSelection} from './catalog.ts'
import {ToolName} from './tool.ts'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Unknown),
	message: Schema.optional(Schema.NonEmptyString)
}) {}

export class PromptTextPart extends Schema.TaggedClass<PromptTextPart>()('text', {
	text: Schema.NonEmptyString
}) {}

export class PromptFilePart extends Schema.TaggedClass<PromptFilePart>()('file', {
	file: Schema.File
}) {}

export type PromptPart = typeof PromptPart.Type
export const PromptPart = Schema.Union([PromptTextPart, PromptFilePart])

export class Usage extends Schema.Class<Usage>('Usage')({
	input: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
	output: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0))),
	reasoning: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(0)))
}) {}

export type MessageRole = typeof MessageRole.Type
export const MessageRole = Schema.Literals(['user', 'assistant'])

export type MessageState = typeof MessageState.Type
export const MessageState = Schema.Literals(['streaming', 'awaiting-response', 'complete', 'error'])

export type FinishReason = typeof FinishReason.Type
export const FinishReason = Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])

export type ApprovalDecision = typeof ApprovalDecision.Type
export const ApprovalDecision = Schema.Literals(['approve', 'deny'])

export type ToolState = typeof ToolState.Type
export const ToolState = Schema.Literals([
	'running',
	'pending-input',
	'pending-approval',
	'completed',
	'error',
	'denied'
])

export class MessageStartEvent extends Schema.TaggedClass<MessageStartEvent>()('message-start', {
	messageId: Schema.NonEmptyString,
	model: ModelSelection,
	role: MessageRole,
	startedAt: Schema.Number
}) {}

export class TextDeltaEvent extends Schema.TaggedClass<TextDeltaEvent>()('text-delta', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString,
	text: Schema.String
}) {}

export class ReasoningDeltaEvent extends Schema.TaggedClass<ReasoningDeltaEvent>()('reasoning-delta', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString,
	text: Schema.String
}) {}

export class FileEvent extends Schema.TaggedClass<FileEvent>()('file', {
	messageId: Schema.NonEmptyString,
	partId: Schema.NonEmptyString,
	file: Schema.File
}) {}

export class ToolCallEvent extends Schema.TaggedClass<ToolCallEvent>()('tool-call', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	tool: ToolName,
	input: Schema.Unknown,
	state: Schema.Literals(['running', 'pending-input'])
}) {}

export class ToolApprovalRequestEvent extends Schema.TaggedClass<ToolApprovalRequestEvent>()('tool-approval-request', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	approvalId: Schema.NonEmptyString,
	tool: ToolName,
	input: Schema.Unknown
}) {}

export class ToolApprovalResponseEvent extends Schema.TaggedClass<ToolApprovalResponseEvent>()(
	'tool-approval-response',
	{
		messageId: Schema.NonEmptyString,
		toolCallId: Schema.NonEmptyString,
		approvalId: Schema.NonEmptyString,
		decision: ApprovalDecision
	}
) {}

export class ToolResultEvent extends Schema.TaggedClass<ToolResultEvent>()('tool-result', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	tool: ToolName,
	output: Schema.Unknown
}) {}

export class ToolErrorEvent extends Schema.TaggedClass<ToolErrorEvent>()('tool-error', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	tool: ToolName,
	error: Schema.Unknown
}) {}

export class MessageFinishEvent extends Schema.TaggedClass<MessageFinishEvent>()('message-finish', {
	messageId: Schema.NonEmptyString,
	finishReason: FinishReason,
	usage: Usage
}) {}

export class MessageErrorEvent extends Schema.TaggedClass<MessageErrorEvent>()('message-error', {
	messageId: Schema.NonEmptyString,
	error: Schema.Unknown
}) {}

export type ConversationEvent = typeof ConversationEvent.Type
export const ConversationEvent = Schema.Union([
	MessageStartEvent,
	TextDeltaEvent,
	ReasoningDeltaEvent,
	FileEvent,
	ToolCallEvent,
	ToolApprovalRequestEvent,
	ToolApprovalResponseEvent,
	ToolResultEvent,
	ToolErrorEvent,
	MessageFinishEvent,
	MessageErrorEvent
])

export type AgentResponse = typeof AgentResponse.Type
export const AgentResponse = Schema.Union([ToolApprovalResponseEvent, ToolResultEvent])

export class TextPart extends Schema.TaggedClass<TextPart>()('text', {
	id: Schema.NonEmptyString,
	text: Schema.String
}) {}

export class ReasoningPart extends Schema.TaggedClass<ReasoningPart>()('reasoning', {
	id: Schema.NonEmptyString,
	text: Schema.String
}) {}

export class FilePart extends Schema.TaggedClass<FilePart>()('file', {
	id: Schema.NonEmptyString,
	file: Schema.File
}) {}

export class ToolPart extends Schema.TaggedClass<ToolPart>()('tool', {
	id: Schema.NonEmptyString,
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	tool: ToolName,
	state: ToolState,
	input: Schema.optional(Schema.Unknown),
	output: Schema.optional(Schema.Unknown),
	error: Schema.optional(Schema.Unknown),
	approvalId: Schema.optional(Schema.NonEmptyString)
}) {}

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	id: Schema.NonEmptyString,
	error: Schema.Unknown
}) {}

export type MessagePart = typeof MessagePart.Type
export const MessagePart = Schema.Union([TextPart, ReasoningPart, FilePart, ToolPart, ErrorPart])

export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
	id: Schema.NonEmptyString,
	model: ModelSelection,
	role: MessageRole,
	startedAt: Schema.Number,
	finishedAt: Schema.optional(Schema.Number),
	state: MessageState,
	finishReason: Schema.optional(FinishReason),
	usage: Usage,
	parts: Schema.Array(MessagePart)
}) {}

const createMessage = (event: MessageStartEvent) =>
	new ConversationMessage({
		id: event.messageId,
		model: event.model,
		role: event.role,
		startedAt: event.startedAt,
		state: 'streaming',
		usage: new Usage({}),
		parts: []
	})

const updateMessage = (
	messages: readonly ConversationMessage[],
	messageId: string,
	updater: (message: ConversationMessage) => ConversationMessage
) => {
	const index = Array.findLastIndex(messages, message => message.id === messageId)
	if (Predicate.isUndefined(index)) return messages
	return Array.map(messages, (message, candidateIndex) => (candidateIndex === index ? updater(message) : message))
}

const upsertPart = (
	parts: readonly MessagePart[],
	matcher: (part: MessagePart) => boolean,
	create: () => MessagePart,
	update: (part: MessagePart) => MessagePart
) => {
	const index = Array.findLastIndex(parts, matcher)
	if (Predicate.isUndefined(index)) return [...parts, create()]
	return Array.map(parts, (part, candidateIndex) => (candidateIndex === index ? update(part) : part))
}

const mapFinishReason = (finishReason: FinishReason): MessageState => {
	switch (finishReason) {
		case 'tool-calls':
			return 'awaiting-response'
		case 'error':
			return 'error'
		default:
			return 'complete'
	}
}

const appendText = (parts: readonly MessagePart[], event: TextDeltaEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'text' && part.id === event.partId,
		() => new TextPart({id: event.partId, text: event.text}),
		part => (part._tag === 'text' ? new TextPart({id: part.id, text: `${part.text}${event.text}`}) : part)
	)

const appendReasoning = (parts: readonly MessagePart[], event: ReasoningDeltaEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'reasoning' && part.id === event.partId,
		() => new ReasoningPart({id: event.partId, text: event.text}),
		part => (part._tag === 'reasoning' ? new ReasoningPart({id: part.id, text: `${part.text}${event.text}`}) : part)
	)

const appendFile = (parts: readonly MessagePart[], event: FileEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'file' && part.id === event.partId,
		() => new FilePart({id: event.partId, file: event.file}),
		part => (part._tag === 'file' ? new FilePart({id: event.partId, file: event.file}) : part)
	)

const getToolPart = (part: MessagePart) => (part._tag === 'tool' ? part : undefined)

const appendToolCall = (parts: readonly MessagePart[], event: ToolCallEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'tool' && part.toolCallId === event.toolCallId,
		() =>
			new ToolPart({
				id: event.toolCallId,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: event.state,
				input: event.input
			}),
		part => {
			const toolPart = getToolPart(part)
			if (Predicate.isUndefined(toolPart)) return part
			return new ToolPart({
				id: toolPart.id,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: event.state,
				input: event.input,
				output: toolPart.output,
				error: toolPart.error,
				approvalId: toolPart.approvalId
			})
		}
	)

const appendApprovalRequest = (parts: readonly MessagePart[], event: ToolApprovalRequestEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'tool' && part.toolCallId === event.toolCallId,
		() =>
			new ToolPart({
				id: event.toolCallId,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'pending-approval',
				input: event.input,
				approvalId: event.approvalId
			}),
		part => {
			const toolPart = getToolPart(part)
			if (Predicate.isUndefined(toolPart)) return part
			return new ToolPart({
				id: toolPart.id,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'pending-approval',
				input: event.input,
				output: toolPart.output,
				error: toolPart.error,
				approvalId: event.approvalId
			})
		}
	)

const appendApprovalResponse = (parts: readonly MessagePart[], event: ToolApprovalResponseEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'tool' && part.toolCallId === event.toolCallId,
		() =>
			new ToolPart({
				id: event.toolCallId,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: 'question',
				state: event.decision === 'approve' ? 'running' : 'denied',
				approvalId: event.approvalId
			}),
		part => {
			const toolPart = getToolPart(part)
			if (Predicate.isUndefined(toolPart)) return part
			return new ToolPart({
				id: toolPart.id,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: toolPart.tool,
				state: event.decision === 'approve' ? 'running' : 'denied',
				input: toolPart.input,
				output: toolPart.output,
				error: toolPart.error,
				approvalId: event.approvalId
			})
		}
	)

const appendToolResult = (parts: readonly MessagePart[], event: ToolResultEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'tool' && part.toolCallId === event.toolCallId,
		() =>
			new ToolPart({
				id: event.toolCallId,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'completed',
				output: event.output
			}),
		part => {
			const toolPart = getToolPart(part)
			if (Predicate.isUndefined(toolPart)) return part
			return new ToolPart({
				id: toolPart.id,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'completed',
				input: toolPart.input,
				output: event.output,
				approvalId: toolPart.approvalId
			})
		}
	)

const appendToolError = (parts: readonly MessagePart[], event: ToolErrorEvent) =>
	upsertPart(
		parts,
		part => part._tag === 'tool' && part.toolCallId === event.toolCallId,
		() =>
			new ToolPart({
				id: event.toolCallId,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'error',
				error: event.error
			}),
		part => {
			const toolPart = getToolPart(part)
			if (Predicate.isUndefined(toolPart)) return part
			return new ToolPart({
				id: toolPart.id,
				messageId: event.messageId,
				toolCallId: event.toolCallId,
				tool: event.tool,
				state: 'error',
				input: toolPart.input,
				output: toolPart.output,
				error: event.error,
				approvalId: toolPart.approvalId
			})
		}
	)

export const appendEvent = (messages: readonly ConversationMessage[], event: ConversationEvent) =>
	pipe(
		Match.value(event),
		Match.tag('message-start', event => {
			const exists = Array.findLastIndex(messages, message => message.id === event.messageId)
			if (Predicate.isUndefined(exists)) return [...messages, createMessage(event)]
			return messages
		}),
		Match.tag('text-delta', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendText(message.parts, event)})
			)
		),
		Match.tag('reasoning-delta', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendReasoning(message.parts, event)})
			)
		),
		Match.tag('file', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendFile(message.parts, event)})
			)
		),
		Match.tag('tool-call', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendToolCall(message.parts, event)})
			)
		),
		Match.tag('tool-approval-request', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendApprovalRequest(message.parts, event)})
			)
		),
		Match.tag('tool-approval-response', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendApprovalResponse(message.parts, event)})
			)
		),
		Match.tag('tool-result', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, parts: appendToolResult(message.parts, event)})
			)
		),
		Match.tag('tool-error', event =>
			updateMessage(
				messages,
				event.messageId,
				message => new ConversationMessage({...message, state: 'error', parts: appendToolError(message.parts, event)})
			)
		),
		Match.tag('message-finish', event =>
			updateMessage(
				messages,
				event.messageId,
				message =>
					new ConversationMessage({
						...message,
						finishedAt: Date.now(),
						finishReason: event.finishReason,
						state: mapFinishReason(event.finishReason),
						usage: event.usage
					})
			)
		),
		Match.tag('message-error', event =>
			updateMessage(
				messages,
				event.messageId,
				message =>
					new ConversationMessage({
						...message,
						state: 'error',
						parts: [...message.parts, new ErrorPart({id: crypto.randomUUID(), error: event.error})]
					})
			)
		),
		Match.exhaustive
	)

export const reconstructMessages = (events: readonly ConversationEvent[]) =>
	Array.reduce(events, [] as const, appendEvent)
