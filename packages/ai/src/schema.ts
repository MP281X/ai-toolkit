import {Match, Option, PubSub, pipe, Ref, Schema, Stream} from 'effect'

import {ModelSelection} from './catalog.ts'

export type ToolName = typeof ToolName.Type
export const ToolName = Schema.Union([
	Schema.Literal('question'),
	Schema.Literal('web'),
	Schema.Literal('bash'),
	Schema.Literal('read'),
	Schema.Literal('write'),
	Schema.Literal('patch'),
	Schema.Literal('glob'),
	Schema.Literal('grep'),
	Schema.String as Schema.Schema<string & {}>
])

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

export const TextPart = Schema.TaggedStruct('text', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
})
export type TextPart = typeof TextPart.Type

export const ReasoningPart = Schema.TaggedStruct('reasoning', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
})
export type ReasoningPart = typeof ReasoningPart.Type

export const FilePart = Schema.TaggedStruct('file', {
	data: Schema.String,
	mediaType: Schema.NonEmptyString,
	filename: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some('attachment')))
})
export type FilePart = typeof FilePart.Type

export const ToolPart = Schema.TaggedStruct('tool', {
	toolCallId: Schema.NonEmptyString,
	toolName: ToolName,
	input: Schema.optional(Schema.Unknown),
	output: Schema.optional(Schema.Unknown),
	error: Schema.optional(Schema.Unknown),
	approvalId: Schema.optional(Schema.NonEmptyString),
	approvalState: Schema.optional(Schema.Literals(['pending', 'approved', 'denied'])),
	status: Schema.Literals(['running', 'pending-approval', 'success', 'error', 'denied'])
})
export type ToolPart = typeof ToolPart.Type

export const ErrorPart = Schema.TaggedStruct('error', {
	error: Schema.Unknown
})
export type ErrorPart = typeof ErrorPart.Type

export const UserMessagePart = Schema.Union([TextPart, FilePart])
export type UserMessagePart = typeof UserMessagePart.Type

export const AssistantMessagePart = Schema.Union([TextPart, ReasoningPart, FilePart, ToolPart, ErrorPart])
export type AssistantMessagePart = typeof AssistantMessagePart.Type

export const ConversationMessagePart = Schema.Union([UserMessagePart, AssistantMessagePart])
export type ConversationMessagePart = typeof ConversationMessagePart.Type

export const StartPart = Schema.TaggedStruct('start', {
	messageId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	model: ModelSelection,
	startedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now()))),
	role: Schema.Literals(['user', 'assistant'])
})
export type StartPart = typeof StartPart.Type

export const FinishPart = Schema.TaggedStruct('finish', {
	finishReason: Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']).pipe(
		Schema.withConstructorDefault(() => Option.some('stop'))
	),
	finishedAt: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now()))),
	usage: Usage.pipe(Schema.withConstructorDefault(() => Option.some(Usage.makeUnsafe({}))))
})
export type FinishPart = typeof FinishPart.Type

export const TextDeltaPart = Schema.TaggedStruct('text-delta', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
})
export type TextDeltaPart = typeof TextDeltaPart.Type

export const ReasoningDeltaPart = Schema.TaggedStruct('reasoning-delta', {
	id: Schema.optional(Schema.NonEmptyString),
	text: Schema.String
})
export type ReasoningDeltaPart = typeof ReasoningDeltaPart.Type

export const ToolCallPart = Schema.TaggedStruct('tool-call', {
	toolCallId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolName: ToolName,
	input: Schema.optional(Schema.Unknown)
})
export type ToolCallPart = typeof ToolCallPart.Type

export const ToolApprovalRequestPart = Schema.TaggedStruct('tool-approval-request', {
	approvalId: Schema.NonEmptyString.pipe(Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))),
	toolCallId: Schema.NonEmptyString,
	toolName: ToolName,
	input: Schema.optional(Schema.Unknown)
})
export type ToolApprovalRequestPart = typeof ToolApprovalRequestPart.Type

export const ToolApprovalResponsePart = Schema.TaggedStruct('tool-approval-response', {
	approvalId: Schema.NonEmptyString,
	approved: Schema.Boolean
})
export type ToolApprovalResponsePart = typeof ToolApprovalResponsePart.Type

export const ToolResultPart = Schema.TaggedStruct('tool-result', {
	toolCallId: Schema.NonEmptyString,
	toolName: ToolName,
	output: Schema.Unknown
})
export type ToolResultPart = typeof ToolResultPart.Type

export const ToolErrorPart = Schema.TaggedStruct('tool-error', {
	toolCallId: Schema.NonEmptyString,
	toolName: ToolName,
	error: Schema.Unknown
})
export type ToolErrorPart = typeof ToolErrorPart.Type

export const ToolResponsePart = Schema.Union([ToolApprovalResponsePart, ToolResultPart])
export type ToolResponsePart = typeof ToolResponsePart.Type

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
export type ConversationPart = typeof ConversationPart.Type

export const ConversationMessage = Schema.Struct({
	id: Schema.NonEmptyString,
	model: ModelSelection,
	startedAt: Schema.Number,
	finishedAt: Schema.optional(Schema.Number),
	role: Schema.Literals(['user', 'assistant']),
	parts: Schema.Array(ConversationMessagePart).pipe(Schema.withConstructorDefault(() => Option.some([] as const))),
	state: Schema.Literals(['streaming', 'complete', 'awaiting-tool', 'error']).pipe(
		Schema.withConstructorDefault(() => Option.some('streaming'))
	),
	finishReason: Schema.optional(Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])),
	usage: Usage.pipe(Schema.withConstructorDefault(() => Option.some(Usage.makeUnsafe({}))))
})
export type ConversationMessage = typeof ConversationMessage.Type

export type MessageRole = StartPart['role']
export type MessageState = ConversationMessage['state']
export type FinishReason = FinishPart['finishReason']
export type ToolApprovalState = ToolPart['approvalState']
export type ToolStatus = ToolPart['status']

function replaceMessage(
	messages: readonly ConversationMessage[],
	index: number,
	message: ConversationMessage
): readonly ConversationMessage[] {
	const next = [...messages]
	next[index] = message
	return next
}

function appendMessagePart(
	message: ConversationMessage,
	part: Exclude<ConversationPart, StartPart | FinishPart>
): ConversationMessage {
	const previousPart = message.parts[message.parts.length - 1]

	if (part._tag === 'text-delta') {
		if (previousPart?._tag === 'text' && previousPart.id === part.id) {
			return ConversationMessage.makeUnsafe({
				...message,
				parts: [...message.parts.slice(0, -1), TextPart.makeUnsafe({id: part.id, text: previousPart.text + part.text})]
			})
		}

		return ConversationMessage.makeUnsafe({
			...message,
			parts: [...message.parts, TextPart.makeUnsafe({id: part.id, text: part.text})]
		})
	}

	if (part._tag === 'reasoning-delta') {
		if (previousPart?._tag === 'reasoning' && previousPart.id === part.id) {
			return ConversationMessage.makeUnsafe({
				...message,
				parts: [
					...message.parts.slice(0, -1),
					ReasoningPart.makeUnsafe({id: part.id, text: previousPart.text + part.text})
				]
			})
		}

		return ConversationMessage.makeUnsafe({
			...message,
			parts: [...message.parts, ReasoningPart.makeUnsafe({id: part.id, text: part.text})]
		})
	}

	if (
		part._tag === 'tool-call' ||
		part._tag === 'tool-approval-request' ||
		part._tag === 'tool-approval-response' ||
		part._tag === 'tool-result' ||
		part._tag === 'tool-error'
	) {
		type NextToolData = {
			approvalId?: string
			approvalState?: ToolPart['approvalState']
			error?: unknown
			input?: unknown
			output?: unknown
			toolCallId: string
			toolName: string
		}

		const toolIndex = message.parts.findLastIndex(candidate => {
			if (candidate._tag !== 'tool') {
				return false
			}

			if (part._tag === 'tool-approval-response') {
				return candidate.approvalId === part.approvalId
			}

			return candidate.toolCallId === part.toolCallId
		})
		const previousTool = toolIndex === -1 ? undefined : (message.parts[toolIndex] as ToolPart)
		let nextToolData: NextToolData
		if (part._tag === 'tool-call') {
			nextToolData = {
				approvalId: previousTool?.approvalId,
				approvalState: previousTool?.approvalState,
				error: previousTool?.error,
				input: part.input,
				output: previousTool?.output,
				toolCallId: part.toolCallId,
				toolName: part.toolName
			}
		} else if (part._tag === 'tool-approval-request') {
			nextToolData = {
				approvalId: part.approvalId,
				approvalState: 'pending',
				error: previousTool?.error,
				input: part.input ?? previousTool?.input,
				output: previousTool?.output,
				toolCallId: part.toolCallId,
				toolName: part.toolName
			}
		} else if (part._tag === 'tool-approval-response') {
			nextToolData = {
				approvalId: part.approvalId,
				approvalState: part.approved ? 'approved' : 'denied',
				error: previousTool?.error,
				input: previousTool?.input,
				output: previousTool?.output,
				toolCallId: previousTool?.toolCallId ?? crypto.randomUUID(),
				toolName: previousTool?.toolName ?? 'tool'
			}
		} else if (part._tag === 'tool-result') {
			nextToolData = {
				approvalId: previousTool?.approvalId,
				approvalState: previousTool?.approvalState,
				input: previousTool?.input,
				output: part.output,
				toolCallId: part.toolCallId,
				toolName: part.toolName
			}
		} else {
			nextToolData = {
				approvalId: previousTool?.approvalId,
				approvalState: previousTool?.approvalState,
				error: part.error,
				input: previousTool?.input,
				output: previousTool?.output,
				toolCallId: part.toolCallId,
				toolName: part.toolName
			}
		}
		const nextTool = ToolPart.makeUnsafe({
			...nextToolData,
			status: pipe(
				Match.value(nextToolData),
				Match.when({approvalState: 'denied'}, () => 'denied' as const),
				Match.when(
					data => data.error !== undefined,
					() => 'error' as const
				),
				Match.when(
					data => data.output !== undefined,
					() => 'success' as const
				),
				Match.when({approvalState: 'pending'}, () => 'pending-approval' as const),
				Match.orElse(() => 'running' as const)
			)
		})
		const nextParts =
			toolIndex === -1
				? [...message.parts, nextTool]
				: message.parts.map((candidate, index) => (index === toolIndex ? nextTool : candidate))

		return ConversationMessage.makeUnsafe({...message, parts: nextParts})
	}

	if (part._tag === 'error') {
		return ConversationMessage.makeUnsafe({
			...message,
			parts: [...message.parts, part],
			state: 'error'
		})
	}

	return ConversationMessage.makeUnsafe({...message, parts: [...message.parts, part]})
}

export function appendConversationPart(messages: readonly ConversationMessage[], part: ConversationPart) {
	if (part._tag === 'start') {
		return [
			...messages,
			ConversationMessage.makeUnsafe({
				id: part.messageId,
				model: part.model,
				role: part.role,
				startedAt: part.startedAt
			})
		]
	}

	let targetIndex = messages.length - 1
	if (part._tag === 'tool-approval-response') {
		targetIndex = messages.findLastIndex(message =>
			message.parts.some(candidate => candidate._tag === 'tool' && candidate.approvalId === part.approvalId)
		)
	} else if (part._tag === 'tool-result' || part._tag === 'tool-error') {
		targetIndex = messages.findLastIndex(message =>
			message.parts.some(candidate => candidate._tag === 'tool' && candidate.toolCallId === part.toolCallId)
		)
	} else if (part._tag === 'tool-call' || part._tag === 'tool-approval-request') {
		targetIndex = messages.findLastIndex(
			message =>
				message.role === 'assistant' &&
				message.parts.some(candidate => candidate._tag === 'tool' && candidate.toolCallId === part.toolCallId)
		)
	}

	if (targetIndex === -1) {
		return messages
	}

	const message = messages[targetIndex]
	if (!message) {
		return messages
	}

	if (part._tag === 'finish') {
		return replaceMessage(
			messages,
			targetIndex,
			ConversationMessage.makeUnsafe({
				...message,
				finishedAt: part.finishedAt,
				finishReason: part.finishReason,
				state: pipe(
					Match.value(part.finishReason),
					Match.when('stop', () => 'complete' as const),
					Match.when('tool-calls', () => 'awaiting-tool' as const),
					Match.orElse(() => 'error' as const)
				),
				usage: part.usage
			})
		)
	}

	return replaceMessage(messages, targetIndex, appendMessagePart(message, part))
}

export function reconstructMessages(parts: readonly ConversationPart[]) {
	return parts.reduce<readonly ConversationMessage[]>(appendConversationPart, [])
}

export function createUserTurnParts(input: {model: ModelSelection; parts: readonly UserMessagePart[]}) {
	const start = StartPart.makeUnsafe({model: input.model, role: 'user'})

	return [
		start,
		...input.parts.map(part =>
			part._tag === 'text' ? TextDeltaPart.makeUnsafe({id: part.id, text: part.text}) : part
		),
		FinishPart.makeUnsafe({})
	] as const satisfies readonly ConversationPart[]
}

export function publishConversationPartStream<E, R>(
	history: Ref.Ref<readonly ConversationMessage[]>,
	events: PubSub.PubSub<ConversationPart>,
	stream: Stream.Stream<ConversationPart, E, R>
) {
	return pipe(
		stream,
		Stream.tap(part => Ref.update(history, messages => appendConversationPart(messages, part))),
		Stream.tap(part => PubSub.publish(events, part)),
		Stream.runDrain
	)
}
