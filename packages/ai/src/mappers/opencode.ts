import type {
	EventMessagePartUpdated,
	EventPermissionAsked,
	EventPermissionReplied,
	Message,
	Part,
	ToolPart
} from '@opencode-ai/sdk/v2'
import {
	AiError,
	AiFinish,
	AiMessage,
	AiMessagePartDelta,
	type AiPart,
	AiReasoningPart,
	AiTextPart,
	AiToolCallPart,
	AiToolPermissionReply,
	AiToolPermissionRequest,
	AiToolResultPart,
	AiUsage
} from '../schemas.ts'

type AssistantMessage = Extract<Message, { role: 'assistant' }>

const isoFromUnix = (time: number | undefined) => (time ? new Date(time).toISOString() : undefined)

const usageFromTokens = (tokens: AssistantMessage['tokens']) =>
	new AiUsage({
		inputTokens: tokens.input,
		outputTokens: tokens.output,
		reasoningTokens: tokens.reasoning,
		cacheReadTokens: tokens.cache.read,
		cacheWriteTokens: tokens.cache.write,
		totalTokens: tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
	})

const errorFromOpencode = (error: unknown) => {
	if (!error) return undefined
	const message = typeof error === 'object' && error !== null && 'name' in error ? `${error.name}` : undefined
	return new AiError({ cause: error, message })
}

const partFromTool = (part: ToolPart): typeof AiPart.Type => {
	if (part.state.status === 'completed') {
		return new AiToolResultPart({
			toolCallId: `${part.callID}`,
			toolName: `${part.tool}`,
			result: part.state.output,
			isError: false
		})
	}
	if (part.state.status === 'error') {
		return new AiToolResultPart({
			toolCallId: `${part.callID}`,
			toolName: `${part.tool}`,
			result: part.state.error,
			isError: true
		})
	}
	return new AiToolCallPart({
		toolCallId: `${part.callID}`,
		toolName: `${part.tool}`,
		args: part.state.input
	})
}

const partFromOpencode = (part: Part): typeof AiPart.Type | undefined => {
	if (part.type === 'text') return new AiTextPart({ text: part.text })
	if (part.type === 'reasoning') return new AiReasoningPart({ text: part.text })
	if (part.type === 'tool') return partFromTool(part)
	return undefined
}

export const fromOpencodeMessage = (message: Message, parts: Part[] = []) => {
	const isAssistant = message.role === 'assistant'
	const assistantMsg = isAssistant ? (message as AssistantMessage) : undefined

	return new AiMessage({
		id: message.id,
		sessionId: message.sessionID,
		role: message.role,
		createdAt: isoFromUnix(message.time.created),
		parts: parts.reduce<(typeof AiPart.Type)[]>((items, p) => {
			const mapped = partFromOpencode(p)
			if (mapped) items.push(mapped)
			return items
		}, []),
		usage: assistantMsg ? usageFromTokens(assistantMsg.tokens) : undefined,
		finish: assistantMsg?.finish ? new AiFinish({ reason: assistantMsg.finish, status: 'success' }) : undefined,
		error: assistantMsg?.error ? errorFromOpencode(assistantMsg.error) : undefined
	})
}

export const fromOpencodeMessages = (messages: { info: Message; parts: Part[] }[]) =>
	messages.map(entry => fromOpencodeMessage(entry.info, entry.parts))

export const fromOpencodePartDelta = (event: EventMessagePartUpdated) => {
	if (!event.properties.delta) return undefined
	return new AiMessagePartDelta({
		partId: event.properties.part.id,
		messageId: event.properties.part.messageID,
		sessionId: event.properties.part.sessionID,
		delta: event.properties.delta
	})
}

export const fromOpencodePermissionRequest = (event: EventPermissionAsked) =>
	new AiToolPermissionRequest({
		id: event.properties.id,
		sessionId: event.properties.sessionID,
		permission: event.properties.permission,
		patterns: event.properties.patterns,
		toolMessageId: event.properties.tool?.messageID,
		toolCallId: event.properties.tool?.callID
	})

export const fromOpencodePermissionReply = (event: EventPermissionReplied) =>
	new AiToolPermissionReply({
		sessionId: event.properties.sessionID,
		requestId: event.properties.requestID,
		reply: event.properties.reply
	})
