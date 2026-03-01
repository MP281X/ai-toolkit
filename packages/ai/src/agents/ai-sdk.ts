import {Array, Config, Effect, Layer, Match, Option, Predicate, pipe, Stream, SubscriptionRef} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type TextStreamPart as AiSdkTextStreamPart, streamText, type ToolSet} from 'ai'

import {type AdapterId, type ModelId, type ModelSelection, offerings, providers} from '../catalog.ts'
import type {ConversationMessage, StreamPart, ToolResponsePart, UserContentPart} from '../schema.ts'
import {
	AiError,
	ErrorPart,
	FilePart,
	Finish,
	partsStreamToMessage,
	ReasoningPart,
	Start,
	TextPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	ToolOutputDeniedPart,
	ToolResultPart
} from '../schema.ts'
import {Agent, Model} from '../service.ts'
import {questionToolSet} from '../tools/question.ts'
import {webSearchToolSet} from '../tools/web-search.ts'

function findProvider(providerId: ModelSelection['provider']) {
	return Array.findFirst(providers, provider => provider.id === providerId)
}

function findOffering(selection: ModelSelection) {
	return Array.findFirst(
		offerings,
		offering =>
			Array.contains(offering.agents, 'ai') &&
			offering.provider === selection.provider &&
			offering.model === selection.model
	)
}

function ensureAiSdkModel(selection: ModelSelection) {
	return Effect.gen(function* () {
		const provider = yield* pipe(
			findProvider(selection.provider),
			Option.match({
				onSome: provider => Effect.succeed(provider),
				onNone: () => new AiError({message: 'Provider not found'})
			})
		)

		if (!('baseUrl' in provider && 'apiKeyEnv' in provider)) {
			return yield* new AiError({message: 'Provider config is invalid for ai-sdk'})
		}

		const offering = yield* pipe(
			findOffering(selection),
			Option.match({
				onSome: offering => Effect.succeed(offering),
				onNone: () => new AiError({message: 'Model offering not found'})
			})
		)

		const apiKey = yield* Effect.mapError(Config.string(provider.apiKeyEnv).asEffect(), cause => new AiError({cause}))

		return {selection, provider, offering, apiKey}
	})
}

function toLanguageModel(runtime: {
	provider: {baseUrl: string}
	offering: {adapter: AdapterId; model: ModelId}
	apiKey: string
}) {
	const config = {baseURL: runtime.provider.baseUrl, name: runtime.offering.adapter, apiKey: runtime.apiKey}

	return Match.value(runtime.offering.adapter).pipe(
		Match.when('openai', () => createOpenAI({apiKey: runtime.apiKey})(runtime.offering.model)),
		Match.when('openai-compatible', () => createOpenAICompatible(config)(runtime.offering.model)),
		Match.when('anthropic', () => createAnthropic(config)(runtime.offering.model)),
		Match.when('openrouter', () => createOpenRouter(config)(runtime.offering.model)),
		Match.exhaustive
	)
}

function conversationMessageToSdk(message: ConversationMessage) {
	if (message.role === 'system') {
		return {
			role: 'system' as const,
			content: message.parts
				.filter(part => part._tag === 'text-part')
				.map(part => part.text)
				.join('\n')
		}
	}

	if (message.role === 'user') {
		const textParts = message.parts
			.filter(part => part._tag === 'text-part')
			.map(part => ({type: 'text' as const, text: part.text}))
		const fileParts = message.parts
			.filter(part => part._tag === 'file-part')
			.map(part => ({type: 'file' as const, data: part.data, mediaType: part.mediaType, filename: part.filename}))

		return {role: 'user' as const, content: [...textParts, ...fileParts]}
	}

	if (message.role === 'assistant') {
		const textParts = message.parts
			.filter(part => part._tag === 'text-part')
			.map(part => ({type: 'text' as const, text: part.text}))
		const toolCalls = message.parts
			.filter(part => part._tag === 'tool-call')
			.map(part => ({
				type: 'tool-call' as const,
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				input: part.input
			}))
		const approvalRequests = message.parts
			.filter(part => part._tag === 'tool-approval-request')
			.map(part => ({type: 'tool-approval-request' as const, approvalId: part.approvalId, toolCallId: part.toolCallId}))

		return {role: 'assistant' as const, content: [...textParts, ...toolCalls, ...approvalRequests]}
	}

	const toolResults = message.parts
		.filter(part => part._tag === 'tool-result-response')
		.map(part => ({
			type: 'tool-result' as const,
			toolCallId: part.toolCallId,
			toolName: part.toolName,
			output: {
				type: 'text' as const,
				value: typeof part.output === 'string' ? part.output : JSON.stringify(part.output)
			}
		}))
	const approvalResponses = message.parts
		.filter(part => part._tag === 'tool-approval-response')
		.map(part => ({
			type: 'tool-approval-response' as const,
			approvalId: part.approvalId,
			approved: part.approved,
			reason: part.reason,
			providerExecuted: part.providerExecuted
		}))

	return {role: 'tool' as const, content: [...toolResults, ...approvalResponses]}
}

function aiPartToStreamPart(part: AiSdkTextStreamPart<ToolSet>) {
	switch (part.type) {
		case 'text-delta':
			return new TextPart({id: part.id, text: part.text})
		case 'reasoning-delta':
			return new ReasoningPart({id: part.id, text: part.text})
		case 'file':
			return new FilePart({data: part.file.base64, mediaType: part.file.mediaType, filename: undefined})
		case 'tool-call':
			return new ToolCallPart({toolCallId: part.toolCallId, toolName: part.toolName, input: part.input})
		case 'tool-approval-request':
			return new ToolApprovalRequestPart({approvalId: part.approvalId, toolCallId: part.toolCall.toolCallId})
		case 'tool-output-denied':
			return new ToolOutputDeniedPart({toolCallId: part.toolCallId, toolName: part.toolName})
		case 'tool-result':
			return new ToolResultPart({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				input: part.input,
				output: part.output
			})
		case 'tool-error':
			return new ToolErrorPart({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				input: part.input,
				error: part.error
			})
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
			return new ErrorPart({error: part.error})
		default:
			return undefined
	}
}

function zeroUsage() {
	return {input: 0, output: 0, reasoning: 0}
}

function userStream(selection: ModelSelection, parts: readonly UserContentPart[]) {
	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'user'})),
		Stream.concat(Stream.fromIterable(parts), Stream.succeed(new Finish({finishReason: 'stop', usage: zeroUsage()})))
	)
}

function toolStream(selection: ModelSelection, parts: readonly ToolResponsePart[]) {
	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'tool'})),
		Stream.concat(Stream.fromIterable(parts), Stream.succeed(new Finish({finishReason: 'stop', usage: zeroUsage()})))
	)
}

function assistantStream(
	selection: ModelSelection,
	languageModel: Parameters<typeof streamText>[0]['model'],
	messages: ReturnType<typeof conversationMessageToSdk>[],
	tools: ToolSet
) {
	const {fullStream} = streamText({model: languageModel, messages, tools})

	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'assistant'})),
		pipe(
			Stream.fromAsyncIterable<AiSdkTextStreamPart<ToolSet>, AiError>(fullStream, cause => new AiError({cause})),
			Stream.map(aiPartToStreamPart),
			Stream.filter(Predicate.isNotUndefined)
		)
	)
}

function upsertMessage(messages: ConversationMessage[], message: ConversationMessage) {
	const previous = messages[messages.length - 1]
	if (!previous) return [...messages, message]
	if (previous.startedAt !== message.startedAt || previous.role !== message.role) return [...messages, message]
	return [...messages.slice(0, -1), message]
}

function applyStream(
	events: SubscriptionRef.SubscriptionRef<StreamPart | undefined>,
	history: SubscriptionRef.SubscriptionRef<ConversationMessage[]>,
	stream: Stream.Stream<StreamPart, AiError>
) {
	return pipe(
		stream,
		Stream.mapEffect(part => pipe(SubscriptionRef.set(events, part), Effect.as(part))),
		partsStreamToMessage,
		Stream.mapEffect(message => SubscriptionRef.update(history, current => upsertMessage(current, message))),
		Stream.runDrain
	)
}

export const AiSdkModel = {
	layer: (input: ModelSelection) =>
		Layer.effect(
			Model,
			Effect.gen(function* () {
				yield* ensureAiSdkModel(input)
				return input
			})
		)
}

export const AiSdkAgent = {
	layer: Layer.effect(
		Agent,
		Effect.gen(function* () {
			const selection = yield* Model
			const runtime = yield* ensureAiSdkModel(selection)
			const languageModel = toLanguageModel(runtime)
			const tools = {
				...(yield* webSearchToolSet),
				...(yield* questionToolSet)
			}
			const events = yield* SubscriptionRef.make<StreamPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<ConversationMessage[]>([])

			return {
				prompt: Effect.fn(function* (parts) {
					yield* applyStream(events, history, userStream(selection, parts))
					const messages = yield* SubscriptionRef.get(history)
					yield* applyStream(
						events,
						history,
						assistantStream(selection, languageModel, messages.map(conversationMessageToSdk), tools)
					)
				}),
				respond: Effect.fn(function* (parts) {
					const messagesBefore = yield* SubscriptionRef.get(history)
					if (Array.isArrayEmpty(messagesBefore)) return yield* new AiError({message: 'No active session'})
					yield* applyStream(events, history, toolStream(selection, parts))
					const messages = yield* SubscriptionRef.get(history)
					yield* applyStream(
						events,
						history,
						assistantStream(selection, languageModel, messages.map(conversationMessageToSdk), tools)
					)
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history),
				reset: Effect.gen(function* () {
					yield* SubscriptionRef.set(history, [])
					yield* SubscriptionRef.set(events, undefined)
				})
			}
		})
	)
}
