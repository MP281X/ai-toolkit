import {Array, Config, Effect, Layer, Match, Option, Predicate, pipe, Stream, SubscriptionRef} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type TextStreamPart as AiSdkTextStreamPart, streamText, type ToolSet} from 'ai'

import {type ModelId, type ModelSelection, offerings, type ProviderId, providers} from '../catalog.ts'
import type {ConversationMessage, MessageStreamPart} from '../schema.ts'
import {
	AiError,
	applyPartsStream,
	ErrorPart,
	FilePart,
	FinishPart,
	ReasoningPart,
	StartPart,
	TextPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	ToolResultPart
} from '../schema.ts'
import {Agent} from '../service.ts'
import {questionToolSet} from '../tools/question.ts'
import {webSearchToolSet} from '../tools/web-search.ts'

const resolveLanguageModel = Effect.fnUntraced(function* (selection: ModelSelection) {
	const provider = yield* pipe(
		Array.findFirst(providers, provider => provider.id === selection.provider),
		Option.match({
			onSome: provider => Effect.succeed(provider),
			onNone: () => new AiError({message: 'Provider not found'})
		})
	)
	const offering = yield* pipe(
		Array.findFirst(
			offerings,
			offering =>
				Array.contains(offering.agents, 'ai') &&
				offering.provider === selection.provider &&
				offering.model === selection.model
		),
		Option.match({
			onSome: offering => Effect.succeed(offering),
			onNone: () => new AiError({message: 'Model offering not found'})
		})
	)
	if (Predicate.isUndefined(provider.apiKeyEnv)) {
		return yield* new AiError({message: 'Provider config is invalid for ai-sdk'})
	}
	const apiKey = yield* pipe(
		Config.string(provider.apiKeyEnv).asEffect(),
		Effect.mapError(cause => new AiError({cause}))
	)

	return Match.value(offering.adapter).pipe(
		Match.when('openai', () => createOpenAI({apiKey})(offering.model)),
		Match.when('openai-compatible', () =>
			createOpenAICompatible({
				baseURL: provider.baseUrl,
				name: offering.adapter,
				apiKey
			})(offering.model)
		),
		Match.when('anthropic', () =>
			createAnthropic({
				baseURL: provider.baseUrl,
				name: offering.adapter,
				apiKey
			})(offering.model)
		),
		Match.when('openrouter', () =>
			createOpenRouter({
				baseURL: provider.baseUrl,
				apiKey
			})(offering.model)
		),
		Match.exhaustive
	)
})

function conversationMessageToSdk(message: ConversationMessage) {
	if (message.role === 'user') {
		return {
			role: 'user' as const,
			content: [
				...pipe(
					Array.filter(message.parts, part => part._tag === 'text'),
					Array.map(part => ({type: 'text' as const, text: part.text}))
				),
				...pipe(
					Array.filter(message.parts, part => part._tag === 'file'),
					Array.map(part => ({
						type: 'file' as const,
						data: part.data,
						mediaType: part.mediaType,
						filename: part.filename
					}))
				)
			]
		}
	}

	if (message.role === 'assistant') {
		return {
			role: 'assistant' as const,
			content: [
				...pipe(
					Array.filter(message.parts, part => part._tag === 'text'),
					Array.map(part => ({type: 'text' as const, text: part.text}))
				),
				...pipe(
					Array.filter(message.parts, part => part._tag === 'tool-call'),
					Array.map(part => ({
						type: 'tool-call' as const,
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						input: part.input
					}))
				),
				...pipe(
					Array.filter(message.parts, part => part._tag === 'tool-approval-request'),
					Array.map(part => ({
						type: 'tool-approval-request' as const,
						approvalId: part.approvalId,
						toolCallId: part.toolCallId
					}))
				)
			]
		}
	}

	return {
		role: 'tool' as const,
		content: [
			...pipe(
				Array.filter(message.parts, part => part._tag === 'tool-result'),
				Array.map(part => ({
					type: 'tool-result' as const,
					toolCallId: part.toolCallId,
					toolName: part.toolName,
					output: {
						type: 'text' as const,
						value: Predicate.isString(part.output) ? part.output : JSON.stringify(part.output)
					}
				}))
			),
			...pipe(
				Array.filter(message.parts, part => part._tag === 'tool-approval-response'),
				Array.map(part => ({
					type: 'tool-approval-response' as const,
					approvalId: part.approvalId,
					approved: part.approved
				}))
			)
		]
	}
}

function assistantStream(
	selection: ModelSelection,
	languageModel: Parameters<typeof streamText>[0]['model'],
	messages: ReturnType<typeof conversationMessageToSdk>[],
	tools: ToolSet
) {
	const {fullStream} = streamText({model: languageModel, messages, tools})

	return Stream.concat(
		Stream.succeed(new StartPart({model: selection, role: 'assistant'})),
		pipe(
			Stream.fromAsyncIterable<AiSdkTextStreamPart<ToolSet>, AiError>(fullStream, cause => new AiError({cause})),
			Stream.map(part => {
				switch (part.type) {
					case 'text-delta':
						return new TextPart({id: part.id, text: part.text})
					case 'reasoning-delta':
						return new ReasoningPart({id: part.id, text: part.text})
					case 'file':
						return new FilePart({data: part.file.base64, mediaType: part.file.mediaType})
					case 'tool-call':
						return new ToolCallPart({toolCallId: part.toolCallId, toolName: part.toolName, input: part.input})
					case 'tool-approval-request':
						return new ToolApprovalRequestPart({approvalId: part.approvalId, toolCallId: part.toolCall.toolCallId})
					case 'tool-result':
						return new ToolResultPart({toolCallId: part.toolCallId, toolName: part.toolName, output: part.output})
					case 'tool-error':
						return new ToolErrorPart({toolCallId: part.toolCallId, toolName: part.toolName, error: part.error})
					case 'finish':
						return new FinishPart({
							finishReason: part.finishReason,
							usage: {
								input: part.totalUsage.inputTokens ?? 0,
								output: part.totalUsage.outputTokenDetails.textTokens ?? 0,
								reasoning: part.totalUsage.outputTokenDetails.reasoningTokens ?? 0
							}
						})
					case 'error':
						return new ErrorPart({error: part.error})
					default:
						return undefined
				}
			}),
			Stream.filter(Predicate.isNotUndefined)
		)
	)
}

export function AiSdkAgentLayer(input: {provider: ProviderId; model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'ai', provider: input.provider, model: input.model}
			const languageModel = yield* resolveLanguageModel(selection)
			const tools = {
				...(yield* webSearchToolSet),
				...(yield* questionToolSet)
			}
			const events = yield* SubscriptionRef.make<MessageStreamPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<ConversationMessage[]>([])
			const runAssistant = Effect.fnUntraced(function* () {
				const messages = yield* SubscriptionRef.get(history)
				yield* applyPartsStream(
					events,
					history,
					assistantStream(selection, languageModel, pipe(messages, Array.map(conversationMessageToSdk)), tools)
				)
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts) {
					yield* applyPartsStream(
						events,
						history,
						Stream.fromIterable([
							new StartPart({model: selection, role: 'user'}),
							...parts,
							new FinishPart({finishReason: 'stop'})
						])
					)
					yield* runAssistant()
				}),
				respond: Effect.fnUntraced(function* (part) {
					yield* applyPartsStream(events, history, Stream.fromIterable([part]))
					yield* runAssistant()
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history)
			})
		})()
	)
}
