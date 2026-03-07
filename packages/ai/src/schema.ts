import {Match, Predicate, pipe, Schema, Stream, SubscriptionRef} from 'effect'

import {ModelSelection} from './catalog.ts'
import {ToolKind} from './tools.ts'

const MessageId = Schema.NonEmptyString
const OptionalString = Schema.optional(Schema.NonEmptyString)

export const MessageRole = Schema.Literals(['user', 'assistant'])
export type MessageRole = typeof MessageRole.Type

export const MessageState = Schema.Literals(['streaming', 'complete', 'awaiting-tool', 'error'])
export type MessageState = typeof MessageState.Type

export const FinishReason = Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])
export type FinishReason = typeof FinishReason.Type

export const ToolApprovalState = Schema.Literals(['pending', 'approved', 'denied'])
export type ToolApprovalState = typeof ToolApprovalState.Type

export const ToolStatus = Schema.Literals(['running', 'pending-approval', 'success', 'error', 'denied'])
export type ToolStatus = typeof ToolStatus.Type

export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
	cause: Schema.optional(Schema.Unknown),
	message: Schema.optional(Schema.NonEmptyString)
}) {}

export const Usage = Schema.Struct({
	input: Schema.Number,
	output: Schema.Number,
	reasoning: Schema.Number
})
export type Usage = typeof Usage.Type

export function makeUsage(input?: Partial<Usage>): Usage {
	return {
		input: input?.input ?? 0,
		output: input?.output ?? 0,
		reasoning: input?.reasoning ?? 0
	}
}

export const TextPart = Schema.TaggedStruct('text', {
	id: OptionalString,
	text: Schema.String
})
export type TextPart = typeof TextPart.Type

export function makeTextPart(input: {id?: string; text: string}): TextPart {
	return {
		_tag: 'text',
		id: input.id,
		text: input.text
	}
}

export const ReasoningPart = Schema.TaggedStruct('reasoning', {
	id: OptionalString,
	text: Schema.String
})
export type ReasoningPart = typeof ReasoningPart.Type

export function makeReasoningPart(input: {id?: string; text: string}): ReasoningPart {
	return {
		_tag: 'reasoning',
		id: input.id,
		text: input.text
	}
}

export const FilePart = Schema.TaggedStruct('file', {
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: Schema.NonEmptyString
})
export type FilePart = typeof FilePart.Type

export function makeFilePart(input: {data: string; filename?: string; mediaType: string}): FilePart {
	return {
		_tag: 'file',
		data: input.data,
		filename: input.filename ?? 'attachment',
		mediaType: input.mediaType
	}
}

export const ToolPart = Schema.TaggedStruct('tool', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	input: Schema.optional(Schema.Unknown),
	output: Schema.optional(Schema.Unknown),
	error: Schema.optional(Schema.Unknown),
	approvalId: OptionalString,
	approvalState: Schema.optional(ToolApprovalState),
	status: ToolStatus
})
export type ToolPart = typeof ToolPart.Type

export const ErrorPart = Schema.TaggedStruct('error', {
	error: Schema.Unknown
})
export type ErrorPart = typeof ErrorPart.Type

export type UserMessagePart = typeof UserMessagePart.Type
export const UserMessagePart = Schema.Union([TextPart, FilePart])

export type AssistantMessagePart = typeof AssistantMessagePart.Type
export const AssistantMessagePart = Schema.Union([TextPart, ReasoningPart, FilePart, ToolPart, ErrorPart])

export type ConversationMessagePart = typeof ConversationMessagePart.Type
export const ConversationMessagePart = Schema.Union([UserMessagePart, AssistantMessagePart])

export const StartPart = Schema.TaggedStruct('start', {
	messageId: MessageId,
	model: ModelSelection,
	startedAt: Schema.Number,
	role: MessageRole
})
export type StartPart = typeof StartPart.Type

export function makeStartPart(input: {
	messageId?: string
	model: ModelSelection
	role: MessageRole
	startedAt?: number
}): StartPart {
	return {
		_tag: 'start',
		messageId: input.messageId ?? crypto.randomUUID(),
		model: input.model,
		role: input.role,
		startedAt: input.startedAt ?? Date.now()
	}
}

export const FinishPart = Schema.TaggedStruct('finish', {
	finishReason: FinishReason,
	finishedAt: Schema.Number,
	usage: Usage
})
export type FinishPart = typeof FinishPart.Type

export function makeFinishPart(input?: {
	finishReason?: FinishReason
	finishedAt?: number
	usage?: Partial<Usage>
}): FinishPart {
	return {
		_tag: 'finish',
		finishReason: input?.finishReason ?? 'stop',
		finishedAt: input?.finishedAt ?? Date.now(),
		usage: makeUsage(input?.usage)
	}
}

export const TextDeltaPart = Schema.TaggedStruct('text-delta', {
	id: OptionalString,
	text: Schema.String
})
export type TextDeltaPart = typeof TextDeltaPart.Type

export function makeTextDeltaPart(input: {id?: string; text: string}): TextDeltaPart {
	return {
		_tag: 'text-delta',
		id: input.id,
		text: input.text
	}
}

export const ReasoningDeltaPart = Schema.TaggedStruct('reasoning-delta', {
	id: OptionalString,
	text: Schema.String
})
export type ReasoningDeltaPart = typeof ReasoningDeltaPart.Type

export function makeReasoningDeltaPart(input: {id?: string; text: string}): ReasoningDeltaPart {
	return {
		_tag: 'reasoning-delta',
		id: input.id,
		text: input.text
	}
}

export const ToolCallPart = Schema.TaggedStruct('tool-call', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	input: Schema.optional(Schema.Unknown)
})
export type ToolCallPart = typeof ToolCallPart.Type

export function makeToolCallPart(input: {
	toolCallId?: string
	toolName: string
	toolKind?: typeof ToolKind.Type
	input?: unknown
}): ToolCallPart {
	const result: Record<string, unknown> = {
		_tag: 'tool-call',
		toolCallId: input.toolCallId ?? crypto.randomUUID(),
		toolKind: input.toolKind ?? 'other',
		toolName: input.toolName
	}
	if (input.input !== undefined) result['input'] = input.input
	return result as unknown as ToolCallPart
}

export const ToolApprovalRequestPart = Schema.TaggedStruct('tool-approval-request', {
	approvalId: Schema.NonEmptyString,
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	input: Schema.optional(Schema.Unknown)
})
export type ToolApprovalRequestPart = typeof ToolApprovalRequestPart.Type

export function makeToolApprovalRequestPart(input: {
	approvalId?: string
	toolCallId: string
	toolName: string
	toolKind?: typeof ToolKind.Type
	input?: unknown
}): ToolApprovalRequestPart {
	const result: Record<string, unknown> = {
		_tag: 'tool-approval-request',
		approvalId: input.approvalId ?? crypto.randomUUID(),
		toolCallId: input.toolCallId,
		toolKind: input.toolKind ?? 'other',
		toolName: input.toolName
	}
	if (input.input !== undefined) result['input'] = input.input
	return result as unknown as ToolApprovalRequestPart
}

export const ToolApprovalResponsePart = Schema.TaggedStruct('tool-approval-response', {
	approvalId: Schema.NonEmptyString,
	approved: Schema.Boolean
})
export type ToolApprovalResponsePart = typeof ToolApprovalResponsePart.Type

export function makeToolApprovalResponsePart(input: {approvalId: string; approved: boolean}): ToolApprovalResponsePart {
	return {
		_tag: 'tool-approval-response',
		approvalId: input.approvalId,
		approved: input.approved
	}
}

export const ToolResultPart = Schema.TaggedStruct('tool-result', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	output: Schema.Unknown
})
export type ToolResultPart = typeof ToolResultPart.Type

export function makeToolResultPart(input: {
	toolCallId: string
	toolName: string
	toolKind?: typeof ToolKind.Type
	output: unknown
}): ToolResultPart {
	return {
		_tag: 'tool-result',
		output: input.output,
		toolCallId: input.toolCallId,
		toolKind: input.toolKind ?? 'other',
		toolName: input.toolName
	}
}

export const ToolErrorPart = Schema.TaggedStruct('tool-error', {
	toolCallId: Schema.NonEmptyString,
	toolName: Schema.NonEmptyString,
	toolKind: ToolKind,
	error: Schema.Unknown
})
export type ToolErrorPart = typeof ToolErrorPart.Type

export function makeToolErrorPart(input: {
	toolCallId: string
	toolName: string
	toolKind?: typeof ToolKind.Type
	error: unknown
}): ToolErrorPart {
	return {
		_tag: 'tool-error',
		error: input.error,
		toolCallId: input.toolCallId,
		toolKind: input.toolKind ?? 'other',
		toolName: input.toolName
	}
}

export function makeErrorPart(error: unknown): ErrorPart {
	return {_tag: 'error', error}
}

export type ToolResponsePart = typeof ToolResponsePart.Type
export const ToolResponsePart = Schema.Union([ToolApprovalResponsePart, ToolResultPart])

export type ToolMessagePart = ToolResponsePart

export const ToolMessagePart = ToolResponsePart

export type ConversationPart = typeof ConversationPart.Type
export const ConversationPart = Schema.Union([
	StartPart,
	FinishPart,
	TextDeltaPart,
	ReasoningDeltaPart,
	FilePart,
	ToolCallPart,
	ToolApprovalRequestPart,
	ToolApprovalResponsePart,
	ToolResultPart,
	ToolErrorPart,
	ErrorPart
])

export type MessageStreamPart = ConversationPart

export const MessageStreamPart = ConversationPart

export const ConversationMessage = Schema.Struct({
	id: MessageId,
	model: ModelSelection,
	startedAt: Schema.Number,
	finishedAt: Schema.optional(Schema.Number),
	role: MessageRole,
	parts: Schema.Array(ConversationMessagePart),
	state: MessageState,
	finishReason: Schema.optional(FinishReason),
	usage: Usage
})
export type ConversationMessage = typeof ConversationMessage.Type

export type MessagePart = ConversationMessagePart

export const MessagePart = ConversationMessagePart

export function makeConversationMessage(input: {
	id: string
	model: ModelSelection
	startedAt: number
	role: MessageRole
	parts?: readonly ConversationMessagePart[]
	state?: MessageState
	finishReason?: FinishReason
	finishedAt?: number
	usage?: Partial<Usage>
}): ConversationMessage {
	return {
		finishReason: input.finishReason,
		finishedAt: input.finishedAt,
		id: input.id,
		model: input.model,
		parts: [...(input.parts ?? [])],
		role: input.role,
		startedAt: input.startedAt,
		state: input.state ?? 'streaming',
		usage: makeUsage(input.usage)
	}
}

function getMessageState(finishReason: FinishReason): MessageState {
	return Match.value(finishReason).pipe(
		Match.when('stop', () => 'complete' as const),
		Match.when('tool-calls', () => 'awaiting-tool' as const),
		Match.orElse(() => 'error' as const)
	)
}

function getToolStatus(input: {approvalState?: ToolApprovalState; error?: unknown; output?: unknown}): ToolStatus {
	if (input.approvalState === 'denied') {
		return 'denied'
	}

	if (Predicate.isNotUndefined(input.error)) {
		return 'error'
	}

	if (Predicate.isNotUndefined(input.output)) {
		return 'success'
	}

	if (input.approvalState === 'pending') {
		return 'pending-approval'
	}

	return 'running'
}

export function makeToolPart(input: {
	toolCallId: string
	toolName: string
	toolKind?: typeof ToolKind.Type
	input?: unknown
	output?: unknown
	error?: unknown
	approvalId?: string
	approvalState?: ToolApprovalState
}): ToolPart {
	const result: Record<string, unknown> = {
		_tag: 'tool',
		status: getToolStatus(input),
		toolCallId: input.toolCallId,
		toolKind: input.toolKind ?? 'other',
		toolName: input.toolName
	}
	if (input.input !== undefined) result['input'] = input.input
	if (input.output !== undefined) result['output'] = input.output
	if (input.error !== undefined) result['error'] = input.error
	if (input.approvalId !== undefined) result['approvalId'] = input.approvalId
	if (input.approvalState !== undefined) result['approvalState'] = input.approvalState
	return result as unknown as ToolPart
}

function mergeToolKind(nextToolKind: typeof ToolKind.Type, currentToolKind: typeof ToolKind.Type) {
	return nextToolKind === 'other' ? currentToolKind : nextToolKind
}

function updateMessages(
	messages: readonly ConversationMessage[],
	matcher: (message: ConversationMessage) => boolean,
	updater: (message: ConversationMessage) => ConversationMessage
) {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index]
		if (message && matcher(message)) {
			return messages.map((entry, entryIndex) => (entryIndex === index ? updater(message) : entry))
		}
	}

	return messages
}

function updateLastMessage(
	messages: readonly ConversationMessage[],
	updater: (message: ConversationMessage) => ConversationMessage
) {
	return updateMessages(messages, () => true, updater)
}

function updateToolPart(
	message: ConversationMessage,
	matcher: (part: ToolPart) => boolean,
	create: () => ToolPart,
	update: (part: ToolPart) => ToolPart
) {
	for (let index = message.parts.length - 1; index >= 0; index--) {
		const part = message.parts[index]
		if (part?._tag === 'tool' && matcher(part)) {
			const nextParts = [...message.parts]
			nextParts[index] = update(part)
			return makeConversationMessage({...message, parts: nextParts})
		}
	}

	return makeConversationMessage({...message, parts: [...message.parts, create()]})
}

function appendMessageContent(
	message: ConversationMessage,
	part: Exclude<ConversationPart, StartPart | FinishPart>
): ConversationMessage {
	const previousPart = message.parts[message.parts.length - 1]

	if (part._tag === 'text-delta') {
		if (previousPart?._tag === 'text' && previousPart.id === part.id) {
			return makeConversationMessage({
				...message,
				parts: [...message.parts.slice(0, -1), makeTextPart({id: part.id, text: previousPart.text + part.text})]
			})
		}

		return makeConversationMessage({...message, parts: [...message.parts, makeTextPart(part)]})
	}

	if (part._tag === 'reasoning-delta') {
		if (previousPart?._tag === 'reasoning' && previousPart.id === part.id) {
			return makeConversationMessage({
				...message,
				parts: [...message.parts.slice(0, -1), makeReasoningPart({id: part.id, text: previousPart.text + part.text})]
			})
		}

		return makeConversationMessage({...message, parts: [...message.parts, makeReasoningPart(part)]})
	}

	if (part._tag === 'tool-call') {
		return updateToolPart(
			message,
			candidate => candidate.toolCallId === part.toolCallId,
			() =>
				makeToolPart({
					input: part.input,
					toolCallId: part.toolCallId,
					toolKind: part.toolKind,
					toolName: part.toolName
				}),
			candidate =>
				makeToolPart({
					approvalId: candidate.approvalId,
					approvalState: candidate.approvalState,
					error: candidate.error,
					input: part.input,
					output: candidate.output,
					toolCallId: candidate.toolCallId,
					toolKind: mergeToolKind(part.toolKind, candidate.toolKind),
					toolName: part.toolName
				})
		)
	}

	if (part._tag === 'tool-approval-request') {
		return updateToolPart(
			message,
			candidate => candidate.toolCallId === part.toolCallId,
			() =>
				makeToolPart({
					approvalId: part.approvalId,
					approvalState: 'pending',
					input: part.input,
					toolCallId: part.toolCallId,
					toolKind: part.toolKind,
					toolName: part.toolName
				}),
			candidate =>
				makeToolPart({
					approvalId: part.approvalId,
					approvalState: 'pending',
					error: candidate.error,
					input: part.input ?? candidate.input,
					output: candidate.output,
					toolCallId: candidate.toolCallId,
					toolKind: mergeToolKind(part.toolKind, candidate.toolKind),
					toolName: part.toolName
				})
		)
	}

	if (part._tag === 'tool-approval-response') {
		return updateToolPart(
			message,
			candidate => candidate.approvalId === part.approvalId,
			() =>
				makeToolPart({
					approvalId: part.approvalId,
					approvalState: part.approved ? 'approved' : 'denied',
					toolCallId: crypto.randomUUID(),
					toolName: 'tool'
				}),
			candidate =>
				makeToolPart({
					approvalId: candidate.approvalId,
					approvalState: part.approved ? 'approved' : 'denied',
					error: candidate.error,
					input: candidate.input,
					output: candidate.output,
					toolCallId: candidate.toolCallId,
					toolKind: candidate.toolKind,
					toolName: candidate.toolName
				})
		)
	}

	if (part._tag === 'tool-result') {
		return updateToolPart(
			message,
			candidate => candidate.toolCallId === part.toolCallId,
			() =>
				makeToolPart({
					output: part.output,
					toolCallId: part.toolCallId,
					toolKind: part.toolKind,
					toolName: part.toolName
				}),
			candidate =>
				makeToolPart({
					approvalId: candidate.approvalId,
					approvalState: candidate.approvalState,
					input: candidate.input,
					output: part.output,
					toolCallId: part.toolCallId,
					toolKind: mergeToolKind(part.toolKind, candidate.toolKind),
					toolName: part.toolName
				})
		)
	}

	if (part._tag === 'tool-error') {
		return updateToolPart(
			message,
			candidate => candidate.toolCallId === part.toolCallId,
			() =>
				makeToolPart({
					error: part.error,
					toolCallId: part.toolCallId,
					toolKind: part.toolKind,
					toolName: part.toolName
				}),
			candidate =>
				makeToolPart({
					approvalId: candidate.approvalId,
					approvalState: candidate.approvalState,
					error: part.error,
					input: candidate.input,
					output: candidate.output,
					toolCallId: part.toolCallId,
					toolKind: mergeToolKind(part.toolKind, candidate.toolKind),
					toolName: part.toolName
				})
		)
	}

	if (part._tag === 'error') {
		return makeConversationMessage({
			...message,
			parts: [...message.parts, part],
			state: 'error'
		})
	}

	return makeConversationMessage({...message, parts: [...message.parts, part]})
}

function updateMessageByTool(
	messages: readonly ConversationMessage[],
	part: ToolApprovalResponsePart | ToolResultPart | ToolErrorPart
) {
	return updateMessages(
		messages,
		message =>
			message.parts.some(candidate => {
				if (candidate._tag !== 'tool') {
					return false
				}

				if (part._tag === 'tool-approval-response') {
					return candidate.approvalId === part.approvalId
				}

				return candidate.toolCallId === part.toolCallId
			}),
		message => appendMessageContent(message, part)
	)
}

export function appendConversationPart(messages: readonly ConversationMessage[], part: ConversationPart) {
	if (part._tag === 'start') {
		return [
			...messages,
			makeConversationMessage({id: part.messageId, model: part.model, role: part.role, startedAt: part.startedAt})
		]
	}

	if (part._tag === 'finish') {
		return updateLastMessage(messages, message =>
			makeConversationMessage({
				...message,
				finishedAt: part.finishedAt,
				finishReason: part.finishReason,
				state: getMessageState(part.finishReason),
				usage: part.usage
			})
		)
	}

	if (part._tag === 'tool-approval-response' || part._tag === 'tool-result' || part._tag === 'tool-error') {
		const updated = updateMessageByTool(messages, part)
		if (updated !== messages) {
			return updated
		}
	}

	if (part._tag === 'tool-call' || part._tag === 'tool-approval-request') {
		const updated = updateMessages(
			messages,
			message =>
				message.role === 'assistant' &&
				message.parts.some(candidate => candidate._tag === 'tool' && candidate.toolCallId === part.toolCallId),
			message => appendMessageContent(message, part)
		)

		if (updated !== messages) {
			return updated
		}
	}

	return updateLastMessage(messages, message => appendMessageContent(message, part))
}

export function reconstructMessages(parts: readonly ConversationPart[]) {
	return parts.reduce<readonly ConversationMessage[]>(appendConversationPart, [])
}

export function createUserTurnParts(input: {model: ModelSelection; parts: readonly UserMessagePart[]}) {
	const messageId = crypto.randomUUID()

	return [
		makeStartPart({messageId, model: input.model, role: 'user'}),
		...input.parts.map(part => (part._tag === 'text' ? makeTextDeltaPart(part) : part)),
		makeFinishPart()
	] as const satisfies readonly ConversationPart[]
}

export function applyConversationPartStream<E, R>(
	events: SubscriptionRef.SubscriptionRef<ConversationPart | undefined>,
	history: SubscriptionRef.SubscriptionRef<readonly ConversationMessage[]>,
	stream: Stream.Stream<ConversationPart, E, R>
) {
	return pipe(
		stream,
		Stream.tap(part => SubscriptionRef.set(events, part)),
		Stream.mapEffect(part => SubscriptionRef.update(history, messages => appendConversationPart(messages, part))),
		Stream.runDrain
	)
}
