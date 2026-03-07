import {Array, Config, Effect, Layer, Match, Option, Predicate, pipe, Stream, SubscriptionRef} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type ModelMessage, streamText, type TextStreamPart, type ToolSet} from 'ai'

import {type ModelId, type ModelSelection, models, type ProviderId, providers} from '../catalog.ts'
import {
	AiError,
	applyConversationPartStream,
	type ConversationMessage,
	type ConversationPart,
	createUserTurnParts,
	type FilePart,
	type MessageStreamPart,
	makeErrorPart,
	makeFilePart,
	makeFinishPart,
	makeReasoningDeltaPart,
	makeStartPart,
	makeTextDeltaPart,
	makeToolApprovalRequestPart,
	makeToolCallPart,
	makeToolErrorPart,
	makeToolResultPart,
	type ToolMessagePart,
	type ToolPart,
	type UserMessagePart
} from '../schema.ts'
import {Agent} from '../service.ts'
import {questionToolSet} from '../tools/question.ts'
import {webSearchToolSet} from '../tools/web-search.ts'
import {
	decodeToolValueOrUndefined,
	makeQuestionToolAnswer,
	makeQuestionToolInput,
	makeQuestionToolOutput,
	makeToolOption,
	makeToolQuestion,
	makeWebToolInput,
	makeWebToolOutput,
	makeWebToolSource,
	QuestionToolInvocationInput,
	QuestionToolOutput,
	stringifyToolValue,
	type ToolKind as ToolKindType,
	WebToolInput,
	WebToolOutput
} from '../tools.ts'

function resolveAiSdkToolKind(toolName: string | undefined): ToolKindType {
	return Match.value(toolName).pipe(
		Match.when('question', () => 'question' as const),
		Match.when('web_search', () => 'web' as const),
		Match.orElse(() => 'other' as const)
	)
}

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

function decodeQuestionToolInput(input: unknown) {
	const decoded = decodeToolValueOrUndefined(QuestionToolInvocationInput, input)
	if (!decoded) {
		return input
	}

	if (decoded.questions) {
		const parsed =
			typeof decoded.questions === 'string' ? parseQuestionJsonOrOriginal(decoded.questions) : decoded.questions
		const questions = parseQuestionListOrUndefined(parsed, decoded)
		if (questions) {
			return makeQuestionToolInput({questions})
		}
	}

	const question = normalizeQuestionText(decoded.question)
	if (!question) {
		return makeQuestionToolInput({questions: []})
	}

	const options = normalizeQuestionOptions(decoded.options ?? decoded.choices)

	return makeQuestionToolInput({
		questions: [
			makeToolQuestion({
				allowFreeform: normalizeQuestionBoolean(decoded.allowFreeform),
				header: normalizeQuestionText(decoded.header),
				multiple: normalizeQuestionBoolean(decoded.multiple),
				options,
				question
			})
		]
	})
}

function decodeQuestionToolOutput(output: unknown) {
	const decoded = decodeToolValueOrUndefined(QuestionToolOutput, output)
	if (decoded) {
		return decoded
	}

	if (typeof output === 'string' && output.length > 0) {
		return makeQuestionToolOutput({answers: [makeQuestionToolAnswer({answer: output, wasFreeform: true})]})
	}

	return output
}

function decodeWebToolInput(input: unknown) {
	const decoded = decodeToolValueOrUndefined(WebToolInput, input)
	if (decoded) {
		return decoded
	}

	if (typeof input !== 'object' || input === null) {
		return input
	}

	const record = input as Record<string, unknown>
	const query = typeof record['query'] === 'string' ? record['query'] : undefined
	const url = typeof record['url'] === 'string' ? record['url'] : undefined

	if (!(query || url)) {
		return input
	}

	return makeWebToolInput({query, url})
}

function decodeWebToolOutput(output: unknown, input?: unknown) {
	const decoded = decodeToolValueOrUndefined(WebToolOutput, output)
	if (decoded) {
		return decoded
	}

	if (typeof output !== 'object' || output === null) {
		return output
	}

	const outputRecord = output as Record<string, unknown>
	const inputRecord = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : undefined
	const outputQuery = outputRecord['query']
	const inputQuery = inputRecord?.['query']
	const outputUrl = outputRecord['url']
	const inputUrl = inputRecord?.['url']
	let query: string | undefined
	if (typeof outputQuery === 'string') {
		query = outputQuery
	} else if (typeof inputQuery === 'string') {
		query = inputQuery
	}

	let url: string | undefined
	if (typeof outputUrl === 'string') {
		url = outputUrl
	} else if (typeof inputUrl === 'string') {
		url = inputUrl
	}
	const text = typeof outputRecord['text'] === 'string' ? outputRecord['text'] : undefined
	const rawSources = Array.isArray(outputRecord['sources']) ? outputRecord['sources'] : []
	const sources = rawSources.flatMap(source => {
		if (typeof source !== 'object' || source === null) {
			return []
		}

		const record = source as Record<string, unknown>
		const sourceUrl = typeof record['url'] === 'string' ? record['url'] : undefined
		if (!sourceUrl) {
			return []
		}

		return [
			makeWebToolSource({
				publishedDate: typeof record['publishedDate'] === 'string' ? record['publishedDate'] : undefined,
				text: typeof record['text'] === 'string' ? record['text'] : undefined,
				title: typeof record['title'] === 'string' ? record['title'] : undefined,
				url: sourceUrl
			})
		]
	})

	if (!(query || url || text || sources.length > 0)) {
		return output
	}

	return makeWebToolOutput({
		provider: typeof outputRecord['provider'] === 'string' ? outputRecord['provider'] : undefined,
		query,
		url,
		text,
		sources
	})
}

function normalizeAiSdkToolInput(toolName: string | undefined, input: unknown) {
	return Match.value(resolveAiSdkToolKind(toolName)).pipe(
		Match.when('question', () => decodeQuestionToolInput(input)),
		Match.when('web', () => decodeWebToolInput(input)),
		Match.orElse(() => input)
	)
}

function normalizeAiSdkToolOutput(toolName: string | undefined, output: unknown, input?: unknown) {
	return Match.value(resolveAiSdkToolKind(toolName)).pipe(
		Match.when('question', () => decodeQuestionToolOutput(output)),
		Match.when('web', () => decodeWebToolOutput(output, input)),
		Match.orElse(() => output)
	)
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
		...(Predicate.isNotUndefined(part.output)
			? [
					{
						type: 'tool-result',
						toolCallId: part.toolCallId,
						toolName: part.toolName,
						output: {type: 'text', value: stringifyToolValue(part.output)}
					} as const
				]
			: []),
		...(Predicate.isNotUndefined(part.error)
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
		Stream.succeed<ConversationPart>(makeStartPart({model: selection, role: 'assistant'})),
		pipe(
			Stream.fromAsyncIterable<TextStreamPart<ToolSet>, AiError>(fullStream, cause => new AiError({cause})),
			Stream.map(part => {
				switch (part.type) {
					case 'text-delta':
						return makeTextDeltaPart({id: part.id, text: part.text})
					case 'reasoning-delta':
						return makeReasoningDeltaPart({id: part.id, text: part.text})
					case 'file':
						return makeFilePart({data: part.file.base64, mediaType: part.file.mediaType})
					case 'tool-call': {
						const input = normalizeAiSdkToolInput(part.toolName, part.input)
						toolInputs.set(part.toolCallId, input)
						return makeToolCallPart({
							input,
							toolCallId: part.toolCallId,
							toolKind: resolveAiSdkToolKind(part.toolName),
							toolName: part.toolName
						})
					}
					case 'tool-approval-request': {
						const input = normalizeAiSdkToolInput(part.toolCall.toolName, part.toolCall.input)
						toolInputs.set(part.toolCall.toolCallId, input)
						return makeToolApprovalRequestPart({
							approvalId: part.approvalId,
							input,
							toolCallId: part.toolCall.toolCallId,
							toolKind: resolveAiSdkToolKind(part.toolCall.toolName),
							toolName: part.toolCall.toolName
						})
					}
					case 'tool-result':
						return makeToolResultPart({
							output: normalizeAiSdkToolOutput(part.toolName, part.output, toolInputs.get(part.toolCallId)),
							toolCallId: part.toolCallId,
							toolKind: resolveAiSdkToolKind(part.toolName),
							toolName: part.toolName
						})
					case 'tool-error':
						return makeToolErrorPart({
							error: part.error,
							toolCallId: part.toolCallId,
							toolKind: resolveAiSdkToolKind(part.toolName),
							toolName: part.toolName
						})
					case 'finish':
						return makeFinishPart({
							finishReason: part.finishReason,
							usage: {
								input: part.totalUsage.inputTokens ?? 0,
								output: part.totalUsage.outputTokenDetails.textTokens ?? 0,
								reasoning: part.totalUsage.outputTokenDetails.reasoningTokens ?? 0
							}
						})
					case 'error':
						return makeErrorPart(part.error)
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
			const selection: ModelSelection = {agent: 'ai', model: input.model, provider: input.provider}
			const languageModel = yield* resolveLanguageModel(selection)
			const tools = {
				...(yield* webSearchToolSet),
				...(yield* questionToolSet)
			}
			const events = yield* SubscriptionRef.make<ConversationPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<readonly ConversationMessage[]>([])

			const runAssistant = Effect.fnUntraced(function* () {
				const messages = yield* SubscriptionRef.get(history)
				yield* applyConversationPartStream(
					events,
					history,
					assistantStream(selection, languageModel, messages.flatMap(conversationMessageToSdk), tools)
				)
			})

			return Agent.of({
				history: SubscriptionRef.changes(history),
				prompt: Effect.fnUntraced(function* (parts: readonly UserMessagePart[]) {
					yield* applyConversationPartStream(
						events,
						history,
						Stream.fromIterable(createUserTurnParts({model: selection, parts}))
					)
					yield* runAssistant()
				}),
				respond: Effect.fnUntraced(function* (part: ToolMessagePart) {
					yield* applyConversationPartStream(events, history, Stream.fromIterable([part]))
					yield* runAssistant()
				}),
				stream: pipe(
					SubscriptionRef.changes(events),
					Stream.filter(Predicate.isNotUndefined)
				) as Stream.Stream<MessageStreamPart>
			})
		})()
	)
}

function parseJsonOrUndefined(value: string) {
	try {
		return JSON.parse(value) as unknown
	} catch {
		return undefined
	}
}

function parseQuestionJsonOrOriginal(value: string) {
	return parseJsonOrUndefined(value) ?? parseJsonOrUndefined(normalizeQuotedJson(value))
}

function normalizeQuotedJson(value: string) {
	return value.replaceAll('/', '')
}

function normalizeQuestionBoolean(value: unknown) {
	if (typeof value === 'boolean') {
		return value
	}

	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.trim().toLowerCase()
	if (normalized === 'true') {
		return true
	}

	if (normalized === 'false') {
		return false
	}

	return undefined
}

function normalizeQuestionText(value: unknown) {
	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.trim()
	return normalized.length > 0 ? normalized : undefined
}

function normalizeQuestionOptions(value: unknown) {
	if (!Array.isArray(value)) {
		return undefined
	}

	const options = value.flatMap(entry => {
		if (typeof entry === 'string') {
			const label = normalizeQuestionText(entry)
			return label ? [makeToolOption({label})] : []
		}

		if (typeof entry !== 'object' || entry === null) {
			return []
		}

		const record = entry as Record<string, unknown>
		const label = normalizeQuestionText(record['label'])
		if (!label) {
			return []
		}

		return [
			makeToolOption({
				description: normalizeQuestionText(record['description']),
				label
			})
		]
	})

	return options.length > 0 ? options : undefined
}

function parseQuestionListOrUndefined(value: unknown, defaults?: QuestionToolInvocationInput) {
	if (!Array.isArray(value)) {
		return undefined
	}

	const questions = value.flatMap(entry => {
		if (typeof entry === 'string') {
			const question = normalizeQuestionText(entry)
			return question
				? [
						makeToolQuestion({
							header: normalizeQuestionText(defaults?.header),
							multiple: normalizeQuestionBoolean(defaults?.multiple),
							allowFreeform: normalizeQuestionBoolean(defaults?.allowFreeform),
							options: normalizeQuestionOptions(defaults?.options ?? defaults?.choices),
							question
						})
					]
				: []
		}

		if (typeof entry !== 'object' || entry === null) {
			return []
		}

		const record = entry as Record<string, unknown>
		const question = normalizeQuestionText(record['question'])
		if (!question) {
			return []
		}

		return [
			makeToolQuestion({
				allowFreeform:
					normalizeQuestionBoolean(record['allowFreeform']) ?? normalizeQuestionBoolean(defaults?.allowFreeform),
				header: normalizeQuestionText(record['header']) ?? normalizeQuestionText(defaults?.header),
				multiple: normalizeQuestionBoolean(record['multiple']) ?? normalizeQuestionBoolean(defaults?.multiple),
				options:
					normalizeQuestionOptions(record['options'] ?? record['choices']) ??
					normalizeQuestionOptions(defaults?.options ?? defaults?.choices),
				question
			})
		]
	})

	return questions.length > 0 ? questions : undefined
}
