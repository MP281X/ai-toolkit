import {Array, Config, Effect, Layer, Match, Option, PubSub, pipe, Ref, Stream} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type ModelMessage, streamText, type TextStreamPart, type ToolSet} from 'ai'

import {type ModelId, type ModelSelection, models, type ProviderId, providers} from '../catalog.ts'
import {
	AiError,
	type ConversationMessage,
	type ConversationPart,
	createUserTurnParts,
	ErrorPart,
	FilePart as FileAttachmentPart,
	type FilePart,
	FinishPart,
	publishConversationPartStream,
	ReasoningDeltaPart,
	StartPart,
	TextDeltaPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	type ToolPart,
	type ToolResponsePart,
	ToolResultPart,
	type UserMessagePart
} from '../schema.ts'
import {Agent} from '../service.ts'
import {questionToolSet} from '../tools/question.ts'
import {webSearchToolSet} from '../tools/web-search.ts'
import {normalizeToolInput, normalizeToolOutput, stringifyToolValue} from '../tools.ts'

const resolveLanguageModel = Effect.fnUntraced(function* (selection: ModelSelection) {
	const provider = yield* pipe(
		Array.findFirst(providers, candidate => candidate.id === selection.provider),
		Option.match({
			onSome: Effect.succeed,
			onNone: () => new AiError({message: 'Provider not found'})
		})
	)
	const offering = yield* pipe(
		Array.findFirst(
			models,
			candidate =>
				candidate.agent === 'ai' && candidate.provider === selection.provider && candidate.model === selection.model
		),
		Option.match({
			onSome: Effect.succeed,
			onNone: () => new AiError({message: 'Model offering not found'})
		})
	)

	if (provider.apiKeyEnv === undefined) {
		return yield* new AiError({message: 'Provider config is invalid for ai-sdk'})
	}

	const apiKey = yield* pipe(
		Config.string(provider.apiKeyEnv).asEffect(),
		Effect.mapError(cause => new AiError({cause}))
	)

	return Match.value(offering.adapter).pipe(
		Match.when('openai', () => createOpenAI({apiKey})(offering.model)),
		Match.when('openai-compatible', () =>
			createOpenAICompatible({apiKey, baseURL: provider.baseUrl, name: offering.adapter})(offering.model)
		),
		Match.when('anthropic', () =>
			createAnthropic({apiKey, baseURL: provider.baseUrl, name: offering.adapter})(offering.model)
		),
		Match.when('openrouter', () => createOpenRouter({apiKey, baseURL: provider.baseUrl})(offering.model)),
		Match.exhaustive
	)
})

type AiAssistantToolContent =
	| {type: 'tool-call'; toolCallId: string; toolName: string; input: unknown}
	| {type: 'tool-approval-request'; approvalId: string; toolCallId: string}

type AiToolContent =
	| {type: 'tool-approval-response'; approvalId: string; approved: boolean}
	| {
			type: 'tool-result'
			toolCallId: string
			toolName: string
			output: {type: 'text'; value: string} | {type: 'error-text'; value: string}
	  }

function toolPartToAssistantContent(part: ToolPart): readonly AiAssistantToolContent[] {
	return [
		{type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, input: part.input ?? null},
		...(part.approvalId && part.approvalState === 'pending'
			? [{type: 'tool-approval-request', approvalId: part.approvalId, toolCallId: part.toolCallId} as const]
			: [])
	]
}

function toolPartToToolContent(part: ToolPart): readonly AiToolContent[] {
	return [
		...(part.approvalId && part.approvalState && part.approvalState !== 'pending'
			? [
					{
						type: 'tool-approval-response',
						approvalId: part.approvalId,
						approved: part.approvalState === 'approved'
					} as const
				]
			: []),
		...(part.output !== undefined
			? [
					{
						type: 'tool-result',
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						output: {type: 'text', value: stringifyToolValue(part.output)}
					} as const
				]
			: []),
		...(part.error !== undefined
			? [
					{
						type: 'tool-result',
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						output: {type: 'error-text', value: stringifyToolValue(part.error)}
					} as const
				]
			: [])
	]
}

function filePartToModelContent(part: FilePart) {
	return {
		type: 'file' as const,
		data: part.data,
		filename: part.filename,
		mediaType: part.mediaType
	}
}

function conversationMessageToSdk(message: ConversationMessage): readonly ModelMessage[] {
	if (message.role === 'user') {
		return [
			{
				role: 'user',
				content: [
					...message.parts.flatMap(part => (part._tag === 'text' ? [{type: 'text' as const, text: part.text}] : [])),
					...message.parts.flatMap(part => (part._tag === 'file' ? [filePartToModelContent(part)] : []))
				]
			}
		]
	}

	const tools = message.parts.flatMap(part => (part._tag === 'tool' ? [part] : []))
	const assistantMessage: ModelMessage = {
		role: 'assistant',
		content: [
			...message.parts.flatMap(part => (part._tag === 'text' ? [{type: 'text' as const, text: part.text}] : [])),
			...message.parts.flatMap(part =>
				part._tag === 'reasoning' ? [{type: 'reasoning' as const, text: part.text}] : []
			),
			...message.parts.flatMap(part => (part._tag === 'file' ? [filePartToModelContent(part)] : [])),
			...tools.flatMap(toolPartToAssistantContent)
		]
	}
	const toolContent = tools.flatMap(toolPartToToolContent)

	return [
		assistantMessage,
		...(toolContent.length > 0 ? ([{role: 'tool', content: toolContent}] satisfies readonly ModelMessage[]) : [])
	]
}

function assistantStream(
	selection: ModelSelection,
	languageModel: Parameters<typeof streamText>[0]['model'],
	messages: readonly ModelMessage[],
	tools: ToolSet
) {
	const {fullStream} = streamText({messages: [...messages], model: languageModel, tools})
	const toolInputs = new Map<string, unknown>()

	return Stream.concat(
		Stream.succeed<ConversationPart>(StartPart.makeUnsafe({model: selection, role: 'assistant'})),
		pipe(
			Stream.fromAsyncIterable<TextStreamPart<ToolSet>, AiError>(fullStream, cause => new AiError({cause})),
			Stream.map(part => {
				switch (part.type) {
					case 'text-delta':
						return TextDeltaPart.makeUnsafe({id: part.id, text: part.text})
					case 'reasoning-delta':
						return ReasoningDeltaPart.makeUnsafe({id: part.id, text: part.text})
					case 'file':
						return FileAttachmentPart.makeUnsafe({data: part.file.base64, mediaType: part.file.mediaType})
					case 'tool-call': {
						const input = normalizeToolInput(part.toolName, part.input)
						toolInputs.set(part.toolCallId, input)
						return ToolCallPart.makeUnsafe({
							input,
							toolCallId: part.toolCallId,
							toolName: part.toolName
						})
					}
					case 'tool-approval-request': {
						const input = normalizeToolInput(part.toolCall.toolName, part.toolCall.input)
						toolInputs.set(part.toolCall.toolCallId, input)
						return ToolApprovalRequestPart.makeUnsafe({
							approvalId: part.approvalId,
							input,
							toolCallId: part.toolCall.toolCallId,
							toolName: part.toolCall.toolName
						})
					}
					case 'tool-result':
						return ToolResultPart.makeUnsafe({
							output: normalizeToolOutput(part.toolName, part.output, toolInputs.get(part.toolCallId)),
							toolCallId: part.toolCallId,
							toolName: part.toolName
						})
					case 'tool-error':
						return ToolErrorPart.makeUnsafe({
							error: part.error,
							toolCallId: part.toolCallId,
							toolName: part.toolName
						})
					case 'finish':
						return FinishPart.makeUnsafe({
							finishReason: part.finishReason,
							usage: {
								input: part.totalUsage.inputTokens ?? 0,
								output: part.totalUsage.outputTokenDetails.textTokens ?? 0,
								reasoning: part.totalUsage.outputTokenDetails.reasoningTokens ?? 0
							}
						})
					case 'error':
						return ErrorPart.makeUnsafe({error: part.error})
					default:
						return undefined
				}
			}),
			Stream.filter(part => part !== undefined)
		)
	)
}

export function AiSdkAgentLayer(input: {provider: ProviderId; model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'ai', model: input.model, provider: input.provider}
			const languageModel = yield* resolveLanguageModel(selection)
			const tools = {
				...(yield* webSearchToolSet),
				...(yield* questionToolSet)
			}
			const events = yield* PubSub.unbounded<ConversationPart>({replay: 100_000})
			const history = yield* Ref.make<readonly ConversationMessage[]>([])

			const runAssistant = Effect.fnUntraced(function* () {
				const messages = yield* Ref.get(history)
				yield* publishConversationPartStream(
					history,
					events,
					assistantStream(selection, languageModel, messages.flatMap(conversationMessageToSdk), tools)
				)
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts: readonly UserMessagePart[]) {
					yield* publishConversationPartStream(
						history,
						events,
						Stream.fromIterable(createUserTurnParts({model: selection, parts}))
					)
					yield* runAssistant()
				}),
				respond: Effect.fnUntraced(function* (part: ToolResponsePart) {
					yield* publishConversationPartStream(history, events, Stream.fromIterable([part]))
					yield* runAssistant()
				}),
				stream: Stream.fromPubSub(events)
			})
		})()
	)
}
