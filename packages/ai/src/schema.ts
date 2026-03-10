import {Array, Match, Option, Predicate, pipe, Schema, String} from 'effect'

import {ModelSelection} from './catalog.ts'
import {QuestionTool, ToolName, WebsearchTool} from './tool.ts'

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.String),
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

export type FinishReason = typeof FinishReason.Type
export const FinishReason = Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])

export type ToolDecision = typeof ToolDecision.Type
export const ToolDecision = Schema.Literals(['approve', 'deny'])

export type ToolState = typeof ToolState.Type
export const ToolState = Schema.Literals([
	'running',
	'pending-input',
	'pending-approval',
	'completed',
	'error',
	'denied'
])

export type MessageState = typeof MessageState.Type
export const MessageState = Schema.Literals(['streaming', 'awaiting-response', 'complete', 'error'])

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

export class QuestionCallEvent extends Schema.TaggedClass<QuestionCallEvent>()('question-call', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	input: QuestionTool.fields.input
}) {}

export class WebsearchCallEvent extends Schema.TaggedClass<WebsearchCallEvent>()('websearch-call', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	input: WebsearchTool.fields.input
}) {}

export class ToolApprovalRequestEvent extends Schema.TaggedClass<ToolApprovalRequestEvent>()('tool-approval-request', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	approvalId: Schema.NonEmptyString,
	tool: ToolName
}) {}

export class ToolApprovalResponse extends Schema.TaggedClass<ToolApprovalResponse>()('tool-approval-response', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	approvalId: Schema.NonEmptyString,
	decision: ToolDecision
}) {}

export class QuestionResultEvent extends Schema.TaggedClass<QuestionResultEvent>()('question-result', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	output: QuestionTool.fields.output
}) {}

export class WebsearchResultEvent extends Schema.TaggedClass<WebsearchResultEvent>()('websearch-result', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	output: WebsearchTool.fields.output
}) {}

export class ToolErrorEvent extends Schema.TaggedClass<ToolErrorEvent>()('tool-error', {
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	tool: ToolName,
	error: Schema.String
}) {}

export class MessageFinishEvent extends Schema.TaggedClass<MessageFinishEvent>()('message-finish', {
	messageId: Schema.NonEmptyString,
	finishReason: FinishReason,
	usage: Usage
}) {}

export class MessageErrorEvent extends Schema.TaggedClass<MessageErrorEvent>()('message-error', {
	messageId: Schema.NonEmptyString,
	error: Schema.String
}) {}

export type ConversationEvent = typeof ConversationEvent.Type
export const ConversationEvent = Schema.Union([
	MessageStartEvent,
	TextDeltaEvent,
	ReasoningDeltaEvent,
	FileEvent,
	QuestionCallEvent,
	WebsearchCallEvent,
	ToolApprovalRequestEvent,
	ToolApprovalResponse,
	QuestionResultEvent,
	WebsearchResultEvent,
	ToolErrorEvent,
	MessageFinishEvent,
	MessageErrorEvent
])

export type AgentResponse = typeof AgentResponse.Type
export const AgentResponse = Schema.Union([ToolApprovalResponse, QuestionResultEvent])

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

export class QuestionToolPart extends Schema.TaggedClass<QuestionToolPart>()('question', {
	id: Schema.NonEmptyString,
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	state: ToolState,
	input: QuestionTool.fields.input,
	output: Schema.optional(QuestionTool.fields.output),
	error: Schema.optional(Schema.String)
}) {}

export class WebsearchToolPart extends Schema.TaggedClass<WebsearchToolPart>()('websearch', {
	id: Schema.NonEmptyString,
	messageId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	state: ToolState,
	input: WebsearchTool.fields.input,
	output: Schema.optional(WebsearchTool.fields.output),
	error: Schema.optional(Schema.String),
	approvalId: Schema.optional(Schema.NonEmptyString)
}) {}

export type ToolPart = typeof ToolPart.Type
export const ToolPart = Schema.Union([QuestionToolPart, WebsearchToolPart])

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	id: Schema.NonEmptyString,
	error: Schema.String
}) {}

export type MessagePart = typeof MessagePart.Type
export const MessagePart = Schema.Union([
	TextPart,
	ReasoningPart,
	FilePart,
	QuestionToolPart,
	WebsearchToolPart,
	ErrorPart
])

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

const appendPart = (message: ConversationMessage, part: MessagePart) =>
	new ConversationMessage({...message, parts: [...message.parts, part]})

const isToolPart = (part: MessagePart) => part._tag === 'question' || part._tag === 'websearch'

const replacePart = (message: ConversationMessage, toolCallId: string, f: (part: ToolPart) => ToolPart) =>
	new ConversationMessage({
		...message,
		parts: Array.map(message.parts, part => {
			if (!isToolPart(part) || part.toolCallId !== toolCallId) return part
			return f(part)
		})
	})

const replaceToolPart = (
	message: ConversationMessage,
	toolCallId: string,
	f: (part: ToolPart) => ToolPart,
	state: (parts: readonly MessagePart[]) => MessageState
) => {
	const parts = Array.map(message.parts, part => {
		if (!isToolPart(part) || part.toolCallId !== toolCallId) return part
		return f(part)
	})

	return new ConversationMessage({...message, parts, state: state(parts)})
}

const updateMessage = (
	messages: readonly ConversationMessage[],
	messageId: string,
	f: (message: ConversationMessage) => ConversationMessage
) => Array.map(messages, message => (message.id === messageId ? f(message) : message))

const addText = (parts: readonly MessagePart[], partId: string, text: string) => {
	const last = Option.getOrUndefined(Array.last(parts))
	if (Predicate.isNotNullish(last) && last._tag === 'text' && last.id === partId) {
		return [...Array.dropRight(parts, 1), new TextPart({id: partId, text: `${last.text}${text}`})]
	}

	return [...parts, new TextPart({id: partId, text})]
}

const addReasoning = (parts: readonly MessagePart[], partId: string, text: string) => {
	const last = Option.getOrUndefined(Array.last(parts))
	if (Predicate.isNotNullish(last) && last._tag === 'reasoning' && last.id === partId) {
		return [...Array.dropRight(parts, 1), new ReasoningPart({id: partId, text: `${last.text}${text}`})]
	}

	return [...parts, new ReasoningPart({id: partId, text})]
}

const approvalState = (decision: typeof ToolDecision.Type) => (decision === 'approve' ? 'running' : 'denied')

const messageStateFromParts = (parts: readonly MessagePart[]) => {
	const pending = Option.getOrUndefined(
		Array.findFirst(
			parts,
			part => isToolPart(part) && (part.state === 'pending-input' || part.state === 'pending-approval')
		)
	)
	if (Predicate.isNotNullish(pending)) return 'awaiting-response'
	return 'streaming'
}

const emptyUsage = () => new Usage({})

export const appendEvent = (messages: readonly ConversationMessage[], event: ConversationEvent) =>
	pipe(
		Match.value(event),
		Match.tag('message-start', value => [
			...messages,
			new ConversationMessage({
				id: value.messageId,
				model: value.model,
				role: value.role,
				startedAt: value.startedAt,
				state: 'streaming',
				usage: emptyUsage(),
				parts: []
			})
		]),
		Match.tag('text-delta', value =>
			updateMessage(
				messages,
				value.messageId,
				message => new ConversationMessage({...message, parts: addText(message.parts, value.partId, value.text)})
			)
		),
		Match.tag('reasoning-delta', value =>
			updateMessage(
				messages,
				value.messageId,
				message => new ConversationMessage({...message, parts: addReasoning(message.parts, value.partId, value.text)})
			)
		),
		Match.tag('file', value =>
			updateMessage(messages, value.messageId, message =>
				appendPart(message, new FilePart({id: value.partId, file: value.file}))
			)
		),
		Match.tag('question-call', value =>
			updateMessage(messages, value.messageId, message =>
				appendPart(
					new ConversationMessage({...message, state: 'awaiting-response'}),
					new QuestionToolPart({
						id: value.toolCallId,
						messageId: value.messageId,
						toolCallId: value.toolCallId,
						state: 'pending-input',
						input: value.input
					})
				)
			)
		),
		Match.tag('websearch-call', value =>
			updateMessage(messages, value.messageId, message =>
				appendPart(
					message,
					new WebsearchToolPart({
						id: value.toolCallId,
						messageId: value.messageId,
						toolCallId: value.toolCallId,
						state: 'running',
						input: value.input
					})
				)
			)
		),
		Match.tag('tool-approval-request', value =>
			updateMessage(messages, value.messageId, message =>
				replacePart(new ConversationMessage({...message, state: 'awaiting-response'}), value.toolCallId, part =>
					part._tag === 'websearch'
						? new WebsearchToolPart({...part, approvalId: value.approvalId, state: 'pending-approval'})
						: part
				)
			)
		),
		Match.tag('tool-approval-response', value =>
			updateMessage(messages, value.messageId, message =>
				replaceToolPart(
					message,
					value.toolCallId,
					part =>
						part._tag === 'websearch'
							? new WebsearchToolPart({...part, approvalId: value.approvalId, state: approvalState(value.decision)})
							: part,
					parts => (value.decision === 'approve' ? messageStateFromParts(parts) : 'awaiting-response')
				)
			)
		),
		Match.tag('question-result', value =>
			updateMessage(messages, value.messageId, message =>
				replaceToolPart(
					message,
					value.toolCallId,
					part =>
						part._tag === 'question' ? new QuestionToolPart({...part, output: value.output, state: 'completed'}) : part,
					messageStateFromParts
				)
			)
		),
		Match.tag('websearch-result', value =>
			updateMessage(messages, value.messageId, message =>
				replaceToolPart(
					message,
					value.toolCallId,
					part =>
						part._tag === 'websearch'
							? new WebsearchToolPart({...part, output: value.output, state: 'completed'})
							: part,
					messageStateFromParts
				)
			)
		),
		Match.tag('tool-error', value =>
			updateMessage(messages, value.messageId, message =>
				replaceToolPart(
					message,
					value.toolCallId,
					part =>
						part._tag === 'question'
							? new QuestionToolPart({...part, error: value.error, state: 'error'})
							: new WebsearchToolPart({...part, error: value.error, state: 'error'}),
					() => 'error'
				)
			)
		),
		Match.tag('message-finish', value =>
			updateMessage(
				messages,
				value.messageId,
				message =>
					new ConversationMessage({
						...message,
						finishedAt: Date.now(),
						finishReason: value.finishReason,
						usage: value.usage,
						state: message.state === 'error' ? 'error' : 'complete'
					})
			)
		),
		Match.tag('message-error', value =>
			updateMessage(messages, value.messageId, message =>
				appendPart(
					new ConversationMessage({...message, finishedAt: Date.now(), state: 'error'}),
					new ErrorPart({id: value.messageId, error: value.error})
				)
			)
		),
		Match.exhaustive
	)

const initialMessages: readonly ConversationMessage[] = []

export const reconstructMessages = (events: readonly ConversationEvent[]) =>
	Array.reduce(events, initialMessages, appendEvent)

export const formatToolAnswer = (answer: readonly string[]) =>
	pipe(answer, Array.map(String.trim), Array.filter(String.isNonEmpty), Array.join(', '))
