import {Predicate, pipe, Schema, Stream} from 'effect'

import type {ModelMessage as AiSdkModelMessage, TextStreamPart as AiSdkTextStreamPart, ToolSet} from 'ai'

import {ModelId, ProviderId} from './catalog.ts'

export class AiSdkError extends Schema.TaggedErrorClass<AiSdkError>()('AiSdkError', {
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

export class ToolCall extends Schema.TaggedClass<ToolCall>()('tool-call', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown
}) {}

export class ToolApprovalRequest extends Schema.TaggedClass<ToolApprovalRequest>()('tool-approval-request', {
	approvalId: Schema.String,
	toolCallId: Schema.String
}) {}

export class ToolOutputDenied extends Schema.TaggedClass<ToolOutputDenied>()('tool-output-denied', {
	toolCallId: Schema.String,
	toolName: Schema.String
}) {}

export class ToolResult extends Schema.TaggedClass<ToolResult>()('tool-result', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	output: Schema.Unknown
}) {}

export class ToolError extends Schema.TaggedClass<ToolError>()('tool-error', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	error: Schema.Unknown
}) {}

export class ToolResultResponsePart extends Schema.TaggedClass<ToolResultResponsePart>()('tool-result', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	output: Schema.Unknown
}) {}

export class ToolApprovalResponsePart extends Schema.TaggedClass<ToolApprovalResponsePart>()('tool-approval-response', {
	approvalId: Schema.String,
	approved: Schema.Boolean,
	reason: Schema.optional(Schema.String),
	providerExecuted: Schema.optional(Schema.Boolean)
}) {}

export type UserContentPart = typeof UserContentPart.Type
export const UserContentPart = Schema.Union([TextPart, FilePart])

export type AssistantContentPart = typeof AssistantContentPart.Type
export const AssistantContentPart = Schema.Union([TextPart, ToolCall, ToolApprovalRequest])

export type ToolContent = typeof ToolContent.Type
export const ToolContent = Schema.Union([ToolResultResponsePart, ToolApprovalResponsePart])

export class SystemModelMessage extends Schema.TaggedClass<SystemModelMessage>()('system', {
	content: Schema.String
}) {}

export class UserModelMessage extends Schema.TaggedClass<UserModelMessage>()('user', {
	content: Schema.Array(UserContentPart)
}) {}

export class AssistantModelMessage extends Schema.TaggedClass<AssistantModelMessage>()('assistant', {
	content: Schema.Array(AssistantContentPart)
}) {}

export class ToolModelMessage extends Schema.TaggedClass<ToolModelMessage>()('tool', {
	content: Schema.Array(ToolContent)
}) {}

export type ModelMessage = typeof ModelMessage.Type
export const ModelMessage = Schema.Union([
	SystemModelMessage,
	UserModelMessage,
	AssistantModelMessage,
	ToolModelMessage
])

export class ErrorPart extends Schema.TaggedClass<ErrorPart>()('error', {
	error: Schema.Defect
}) {}

export class Start extends Schema.TaggedClass<Start>()('start', {
	model: Schema.Struct({provider: ProviderId, model: ModelId}),
	startedAt: Schema.Number,
	role: Schema.Literals(['user', 'assistant', 'system', 'tool'])
}) {}

export class Finish extends Schema.TaggedClass<Finish>()('finish', {
	finishReason: Schema.Literals(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other']),
	usage: Schema.Struct({input: Schema.Number, output: Schema.Number, reasoning: Schema.Number})
}) {}

export type ContentPart = typeof ContentPart.Type
export const ContentPart = Schema.Union([
	TextPart,
	ReasoningPart,
	FilePart,
	ToolCall,
	ToolApprovalRequest,
	ToolOutputDenied,
	ToolResult,
	ToolError,
	ErrorPart
])

export type StreamPart = typeof StreamPart.Type
export const StreamPart = Schema.Union([Start, ContentPart, Finish])

export class ConversationMessage extends Schema.Class<ConversationMessage>('ConversationMessage')({
	model: Start.fields.model,
	startedAt: Schema.Number,
	role: Start.fields.role,
	parts: Schema.Array(ContentPart),
	finishReason: Schema.optional(Finish.fields.finishReason),
	usage: Schema.optional(Finish.fields.usage)
}) {}

export function modelMessageToSdk(message: ModelMessage): AiSdkModelMessage {
	if (message._tag === 'system') return {role: 'system', content: message.content}
	if (message._tag === 'user') {
		return {
			role: 'user',
			content: message.content.map(part =>
				part._tag === 'text-part'
					? {type: 'text', text: part.text}
					: {type: 'file', data: part.data, mediaType: part.mediaType, filename: part.filename}
			)
		}
	}
	if (message._tag === 'assistant') {
		return {
			role: 'assistant',
			content: message.content.map(part => {
				if (part._tag === 'text-part') return {type: 'text', text: part.text}
				if (part._tag === 'tool-call') {
					return {type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, input: part.input}
				}
				return {type: 'tool-approval-request', approvalId: part.approvalId, toolCallId: part.toolCallId}
			})
		}
	}
	return {
		role: 'tool',
		content: message.content.map(part => {
			if (part._tag === 'tool-approval-response') {
				return {
					type: 'tool-approval-response',
					approvalId: part.approvalId,
					approved: part.approved,
					reason: part.reason,
					providerExecuted: part.providerExecuted
				}
			}
			return {
				type: 'tool-result',
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				output: {
					type: 'text',
					value: typeof part.output === 'string' ? part.output : JSON.stringify(part.output)
				}
			}
		})
	}
}

export function sdkStreamPartToStreamPart(part: AiSdkTextStreamPart<ToolSet>) {
	switch (part.type) {
		case 'text-delta':
			return new TextPart({id: part.id, text: part.text})
		case 'reasoning-delta':
			return new ReasoningPart({id: part.id, text: part.text})
		case 'file':
			return new FilePart({data: part.file.base64, mediaType: part.file.mediaType})
		case 'tool-call':
			return new ToolCall({toolCallId: part.toolCallId, toolName: part.toolName, input: part.input})
		case 'tool-approval-request':
			return new ToolApprovalRequest({approvalId: part.approvalId, toolCallId: part.toolCall.toolCallId})
		case 'tool-output-denied':
			return new ToolOutputDenied({toolCallId: part.toolCallId, toolName: part.toolName})
		case 'tool-result':
			return new ToolResult(part)
		case 'tool-error':
			return new ToolError(part)
		case 'finish':
			return new Finish({
				finishReason: part.finishReason,
				usage: {
					input: part.totalUsage?.inputTokens ?? 0,
					output: part.totalUsage?.outputTokenDetails?.textTokens ?? 0,
					reasoning: part.totalUsage?.outputTokenDetails?.reasoningTokens ?? 0
				}
			})
		case 'error':
			return new ErrorPart(part)
		default:
			return undefined
	}
}

export function conversationMessageToModelMessage(message: ConversationMessage) {
	if (message.role === 'system') {
		return new SystemModelMessage({
			content: message.parts
				.filter(part => part._tag === 'text-part')
				.map(part => part.text)
				.join('\n')
		})
	}
	if (message.role === 'user') {
		const content = []
		for (const part of message.parts) {
			if (part._tag === 'text-part') content.push(new TextPart({text: part.text}))
			if (part._tag === 'file-part') {
				content.push(new FilePart({data: part.data, mediaType: part.mediaType, filename: part.filename}))
			}
		}
		return new UserModelMessage({content})
	}
	if (message.role === 'assistant') {
		const content = []
		for (const part of message.parts) {
			if (part._tag === 'text-part') content.push(new TextPart({text: part.text}))
			if (part._tag === 'tool-call')
				content.push(new ToolCall({toolCallId: part.toolCallId, toolName: part.toolName, input: part.input}))
			if (part._tag === 'tool-approval-request') {
				content.push(new ToolApprovalRequest({approvalId: part.approvalId, toolCallId: part.toolCallId}))
			}
		}
		return new AssistantModelMessage({content})
	}
	const content = []
	for (const part of message.parts) {
		if (part._tag === 'tool-result') {
			content.push(
				new ToolResultResponsePart({toolCallId: part.toolCallId, toolName: part.toolName, output: part.output})
			)
		}
		if (part._tag === 'tool-output-denied') {
			content.push(
				new ToolResultResponsePart({
					toolCallId: part.toolCallId,
					toolName: part.toolName,
					output: {type: 'execution-denied' as const}
				})
			)
		}
	}
	return new ToolModelMessage({content})
}

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
			if (part._tag === 'finish' && Predicate.isNotUndefined(current)) {
				return new ConversationMessage({...current, finishReason: part.finishReason, usage: part.usage})
			}

			if (part._tag !== 'finish' && Predicate.isNotUndefined(current)) {
				return new ConversationMessage({...current, parts: appendPart(current.parts, part)})
			}

			return current
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}
