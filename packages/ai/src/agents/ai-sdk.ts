import {Array, Config, Effect, Layer, Match, Option, PubSub, Ref, Schema, Stream} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type ModelMessage, streamText, type TextStreamPart, type ToolSet, tool} from 'ai'
import Exa from 'exa-js'

import {type ModelSelection, models, providers} from '../catalog.ts'
import {
	AiError,
	type ConversationEvent,
	type ConversationMessage,
	createPromptEvents,
	FileEvent,
	MessageErrorEvent,
	MessageFinishEvent,
	MessageStartEvent,
	type PromptPart,
	publishConversationEventStream,
	ReasoningDeltaEvent,
	TextDeltaEvent,
	ToolApprovalRequestEvent,
	ToolCallEvent,
	ToolErrorEvent,
	type ToolResponse,
	ToolResultEvent,
	Usage
} from '../schema.ts'
import {Agent} from '../service.ts'
import {
	normalizeToolInput,
	normalizeToolKind,
	normalizeToolOutput,
	QuestionToolInput,
	stringifyToolValue,
	WebToolInput,
	WebToolOutput,
	WebToolSource
} from '../tools.ts'

const resolveLanguageModel = Effect.fnUntraced(function* (selection: ModelSelection) {
	const provider = yield* Option.match(
		Array.findFirst(providers, candidate => candidate.id === selection.provider),
		{
			onNone: () => new AiError({message: 'Provider not found'}),
			onSome: Effect.succeed
		}
	)
	const offering = yield* Option.match(
		Array.findFirst(
			models,
			candidate =>
				candidate.agent === 'ai' && candidate.provider === selection.provider && candidate.model === selection.model
		),
		{
			onNone: () => new AiError({message: 'Model not found'}),
			onSome: Effect.succeed
		}
	)

	if (provider.apiKeyEnv === undefined) {
		return yield* new AiError({message: 'Missing provider API key configuration'})
	}

	const apiKey = yield* Effect.mapError(Config.string(provider.apiKeyEnv).asEffect(), cause => new AiError({cause}))

	return Match.value(offering.adapter).pipe(
		Match.when('openai', () => createOpenAI({apiKey})(offering.model)),
		Match.when('openai-compatible', () =>
			createOpenAICompatible({apiKey, baseURL: provider.baseUrl, name: offering.adapter})(offering.model)
		),
		Match.when('anthropic', () =>
			createAnthropic({apiKey, baseURL: provider.baseUrl, name: offering.adapter})(offering.model)
		),
		Match.when('openrouter', () => createOpenRouter({apiKey, baseURL: provider.baseUrl})(offering.model)),
		Match.orElse(() => createOpenRouter({apiKey, baseURL: provider.baseUrl})(offering.model))
	)
})

function conversationMessageToModelMessages(message: ConversationMessage): readonly ModelMessage[] {
	if (message.role === 'user') {
		const content = [] as Array<
			{type: 'text'; text: string} | {type: 'file'; data: string; filename: string; mediaType: string}
		>
		for (const part of message.parts) {
			if (part._tag === 'text') {
				content.push({type: 'text', text: part.text})
			}
			if (part._tag === 'file') {
				content.push({type: 'file', data: part.data, filename: part.filename, mediaType: part.mediaType})
			}
		}
		return [
			{
				role: 'user',
				content
			}
		] as const
	}

	const assistantContent = [] as Array<
		| {type: 'text'; text: string}
		| {type: 'reasoning'; text: string}
		| {type: 'file'; data: string; filename: string; mediaType: string}
		| {type: 'tool-call'; toolCallId: string; toolName: string; input: unknown}
		| {type: 'tool-approval-request'; approvalId: string; toolCallId: string}
	>
	const toolContent = [] as Array<
		| {type: 'tool-approval-response'; approvalId: string; approved: boolean}
		| {
				type: 'tool-result'
				toolCallId: string
				toolName: string
				output: {type: 'text'; value: string} | {type: 'error-text'; value: string}
		  }
	>
	for (const part of message.parts) {
		if (part._tag === 'text') {
			assistantContent.push({type: 'text', text: part.text})
		}
		if (part._tag === 'reasoning') {
			assistantContent.push({type: 'reasoning', text: part.text})
		}
		if (part._tag === 'file') {
			assistantContent.push({type: 'file', data: part.data, filename: part.filename, mediaType: part.mediaType})
		}
		if (part._tag === 'tool') {
			assistantContent.push({
				type: 'tool-call',
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				input: part.input ?? {}
			})
			if (part.approvalId && part.state === 'pending-approval') {
				assistantContent.push({type: 'tool-approval-request', approvalId: part.approvalId, toolCallId: part.toolCallId})
			}
			if (part.approvalId && part.state === 'running') {
				toolContent.push({type: 'tool-approval-response', approvalId: part.approvalId, approved: true})
			}
			if (part.approvalId && part.state === 'denied') {
				toolContent.push({type: 'tool-approval-response', approvalId: part.approvalId, approved: false})
			}
			if (part.output) {
				toolContent.push({
					type: 'tool-result',
					toolCallId: part.toolCallId,
					toolName: part.toolName,
					output: {type: 'text', value: stringifyToolValue(part.output)}
				})
			}
			if (part.error) {
				toolContent.push({
					type: 'tool-result',
					toolCallId: part.toolCallId,
					toolName: part.toolName,
					output: {type: 'error-text', value: stringifyToolValue(part.error)}
				})
			}
		}
	}

	return [
		{role: 'assistant', content: assistantContent},
		...(toolContent.length > 0 ? ([{role: 'tool', content: toolContent}] satisfies readonly ModelMessage[]) : [])
	] as const
}

const makeAiTools = Effect.fnUntraced(function* () {
	const exa = new Exa(yield* Config.string('AI_EXA'))

	return {
		question: tool({
			description: 'Ask one or more questions and wait for user responses.',
			inputSchema: Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(QuestionToolInput))
		}),
		web: tool({
			description: 'Search the web and fetch source summaries.',
			inputSchema: Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(WebToolInput)),
			execute: async input => {
				const result = await exa.searchAndContents(input.query ?? input.url ?? '', {
					livecrawl: 'always',
					numResults: 3,
					text: {maxCharacters: 1000}
				})

				return WebToolOutput.makeUnsafe({
					provider: 'exa',
					query: input.query,
					url: input.url,
					sources: result.results.map(source =>
						WebToolSource.makeUnsafe({
							publishedDate: source.publishedDate,
							text: source.text,
							title: source.title ?? undefined,
							url: source.url
						})
					)
				})
			}
		})
	} satisfies ToolSet
})

function assistantEventStream(input: {
	history: readonly ConversationMessage[]
	selection: ModelSelection
	languageModel: Parameters<typeof streamText>[0]['model']
	tools: ToolSet
}) {
	const messageId = crypto.randomUUID()
	const inputs = new Map<string, unknown>()
	const fullStream = streamText({
		messages: input.history.flatMap(conversationMessageToModelMessages),
		model: input.languageModel,
		tools: input.tools
	}).fullStream

	return Stream.concat(
		Stream.succeed<ConversationEvent>(
			MessageStartEvent.makeUnsafe({messageId, model: input.selection, role: 'assistant'})
		),
		Stream.fromAsyncIterable<TextStreamPart<ToolSet>, AiError>(fullStream, cause => new AiError({cause})).pipe(
			Stream.map(part => {
				if (part.type === 'text-delta') {
					return TextDeltaEvent.makeUnsafe({messageId, partId: part.id ?? crypto.randomUUID(), text: part.text})
				}

				if (part.type === 'reasoning-delta') {
					return ReasoningDeltaEvent.makeUnsafe({messageId, partId: part.id ?? crypto.randomUUID(), text: part.text})
				}

				if (part.type === 'file') {
					return FileEvent.makeUnsafe({
						data: part.file.base64,
						filename: 'attachment',
						mediaType: part.file.mediaType,
						messageId,
						partId: crypto.randomUUID()
					})
				}

				if (part.type === 'tool-call') {
					const normalizedInput = normalizeToolInput(part.toolName, part.input)
					inputs.set(part.toolCallId, normalizedInput)
					return ToolCallEvent.makeUnsafe({
						input: normalizedInput,
						messageId,
						partId: part.toolCallId,
						state: normalizeToolKind(part.toolName) === 'question' ? 'pending-user-input' : 'running',
						toolCallId: part.toolCallId,
						toolKind: normalizeToolKind(part.toolName),
						toolName: part.toolName
					})
				}

				if (part.type === 'tool-approval-request') {
					const normalizedInput = normalizeToolInput(part.toolCall.toolName, part.toolCall.input)
					inputs.set(part.toolCall.toolCallId, normalizedInput)
					return ToolApprovalRequestEvent.makeUnsafe({
						approvalId: part.approvalId,
						input: normalizedInput,
						messageId,
						partId: part.approvalId,
						toolCallId: part.toolCall.toolCallId,
						toolKind: normalizeToolKind(part.toolCall.toolName),
						toolName: part.toolCall.toolName
					})
				}

				if (part.type === 'tool-result') {
					return ToolResultEvent.makeUnsafe({
						messageId,
						output: normalizeToolOutput(part.toolName, part.output, inputs.get(part.toolCallId)),
						partId: part.toolCallId,
						toolCallId: part.toolCallId,
						toolKind: normalizeToolKind(part.toolName),
						toolName: part.toolName
					})
				}

				if (part.type === 'tool-error') {
					return ToolErrorEvent.makeUnsafe({
						error: part.error,
						messageId,
						partId: part.toolCallId,
						toolCallId: part.toolCallId,
						toolKind: normalizeToolKind(part.toolName),
						toolName: part.toolName
					})
				}

				if (part.type === 'finish') {
					return MessageFinishEvent.makeUnsafe({
						finishReason: part.finishReason,
						messageId,
						usage: Usage.makeUnsafe({
							input: part.totalUsage.inputTokens ?? 0,
							output: part.totalUsage.outputTokenDetails.textTokens ?? 0,
							reasoning: part.totalUsage.outputTokenDetails.reasoningTokens ?? 0
						})
					})
				}

				if (part.type === 'error') {
					return MessageErrorEvent.makeUnsafe({error: part.error, messageId, partId: crypto.randomUUID()})
				}

				return undefined
			}),
			Stream.filter(part => part !== undefined)
		)
	)
}

export function AiSdkAgentLayer(selection: ModelSelection) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const languageModel = yield* resolveLanguageModel(selection)
			const tools = yield* makeAiTools()
			const events = yield* PubSub.unbounded<ConversationEvent>({replay: 100_000})
			const history = yield* Ref.make<readonly ConversationMessage[]>([])

			const runAssistant = Effect.fnUntraced(function* () {
				yield* publishConversationEventStream(
					history,
					events,
					assistantEventStream({
						history: yield* Ref.get(history),
						languageModel,
						selection,
						tools
					})
				)
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts: readonly PromptPart[]) {
					yield* publishConversationEventStream(
						history,
						events,
						Stream.fromIterable(createPromptEvents({model: selection, parts}))
					)
					yield* runAssistant()
				}),
				respond: Effect.fnUntraced(function* (response: ToolResponse) {
					yield* publishConversationEventStream(history, events, Stream.fromIterable([response]))
					yield* runAssistant()
				}),
				stream: Stream.fromPubSub(events)
			})
		})()
	)
}
