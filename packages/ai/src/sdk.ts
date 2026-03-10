import {Array, Config, Effect, Match, Option, Predicate, PubSub, pipe, Ref, Schema, Stream} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {jsonSchema, streamText} from 'ai'
import Exa from 'exa-js'

import {type ModelSelection, models, providers} from './catalog.ts'
import {
	type AgentResponse,
	AiError,
	appendEvent,
	type ConversationEvent,
	type ConversationMessage,
	FileEvent,
	MessageErrorEvent,
	MessageFinishEvent,
	MessageStartEvent,
	type PromptPart,
	ReasoningDeltaEvent,
	TextDeltaEvent,
	ToolApprovalRequestEvent,
	ToolCallEvent,
	ToolErrorEvent,
	ToolResultEvent,
	Usage
} from './schema.ts'
import {Agent} from './service.ts'
import {QuestionTool, WebsearchTool} from './tool.ts'

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
				candidate.agent === selection.agent &&
				candidate.provider === selection.provider &&
				candidate.model === selection.model
		),
		{
			onNone: () => new AiError({message: 'Model not found'}),
			onSome: Effect.succeed
		}
	)

	if (Predicate.isUndefined(provider.apiKeyEnv)) {
		return yield* new AiError({message: 'Missing provider API key configuration'})
	}

	const apiKey = yield* pipe(
		Config.string(provider.apiKeyEnv).asEffect(),
		Effect.mapError(cause => new AiError({cause}))
	)

	return pipe(
		Match.value(offering.adapter),
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

const encodeFile = async (file: globalThis.File) => {
	const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
	return {
		dataUrl: `data:${file.type};base64,${base64}`,
		mediaType: file.type,
		filename: file.name
	}
}

const isQuestionInput = (value: unknown) => Option.isSome(Schema.decodeUnknownOption(QuestionTool.fields.input)(value))

const isWebsearchInput = (value: unknown) =>
	Option.isSome(Schema.decodeUnknownOption(WebsearchTool.fields.input)(value))

const isQuestionOutput = (value: unknown) =>
	Option.isSome(Schema.decodeUnknownOption(QuestionTool.fields.output)(value))

const isWebsearchOutput = (value: unknown) =>
	Option.isSome(Schema.decodeUnknownOption(WebsearchTool.fields.output)(value))

const stringifyUnknown = (value: unknown) => {
	if (Predicate.isString(value)) return value
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return `${value}`
	}
}

const toToolResultOutput = (value: unknown) => {
	if (Predicate.isString(value)) return {type: 'text' as const, value}
	if (Predicate.isNumber(value) || Predicate.isBoolean(value) || Predicate.isNull(value)) {
		return {type: 'json' as const, value}
	}
	if (Array.isArray(value) || Predicate.isObject(value)) {
		return {type: 'json' as const, value}
	}
	return {type: 'text' as const, value: stringifyUnknown(value)}
}

const conversationMessageToModelMessages = Effect.fnUntraced(function* (message: ConversationMessage) {
	if (message.role === 'user') {
		const content = [] as Array<
			{type: 'text'; text: string} | {type: 'file'; data: string; mediaType: string; filename: string}
		>

		for (const part of message.parts) {
			if (part._tag === 'text') content.push({type: 'text', text: part.text})
			if (part._tag === 'file') {
				const encoded = yield* Effect.promise(() => encodeFile(part.file))
				content.push({type: 'file', data: encoded.dataUrl, mediaType: encoded.mediaType, filename: encoded.filename})
			}
		}

		return [{role: 'user' as const, content}]
	}

	const assistantContent = [] as Array<
		| {type: 'text'; text: string}
		| {type: 'reasoning'; text: string}
		| {type: 'file'; data: string; mediaType: string; filename: string}
		| {type: 'tool-call'; toolCallId: string; toolName: string; input: unknown}
		| {type: 'tool-approval-request'; approvalId: string; toolCallId: string}
	>
	const toolContent = [] as Array<
		| {type: 'tool-approval-response'; approvalId: string; approved: boolean}
		| {
				type: 'tool-result'
				toolCallId: string
				toolName: string
				output:
					| {type: 'text'; value: string}
					| {type: 'json'; value: object | readonly unknown[] | number | boolean | null}
					| {type: 'error-text'; value: string}
		  }
	>

	for (const part of message.parts) {
		if (part._tag === 'text') assistantContent.push({type: 'text', text: part.text})
		if (part._tag === 'reasoning') assistantContent.push({type: 'reasoning', text: part.text})
		if (part._tag === 'file') {
			const encoded = yield* Effect.promise(() => encodeFile(part.file))
			assistantContent.push({
				type: 'file',
				data: encoded.dataUrl,
				mediaType: encoded.mediaType,
				filename: encoded.filename
			})
		}
		if (part._tag === 'tool') {
			assistantContent.push({
				type: 'tool-call',
				toolCallId: part.toolCallId,
				toolName: part.tool,
				input: part.input ?? {}
			})
			if (Predicate.isNotNullish(part.approvalId)) {
				assistantContent.push({type: 'tool-approval-request', approvalId: part.approvalId, toolCallId: part.toolCallId})
				if (part.state === 'running')
					toolContent.push({type: 'tool-approval-response', approvalId: part.approvalId, approved: true})
				if (part.state === 'denied')
					toolContent.push({type: 'tool-approval-response', approvalId: part.approvalId, approved: false})
			}
			if (Predicate.isNotNullish(part.output)) {
				toolContent.push({
					type: 'tool-result',
					toolCallId: part.toolCallId,
					toolName: part.tool,
					output: toToolResultOutput(part.output)
				})
			}
			if (Predicate.isNotNullish(part.error)) {
				toolContent.push({
					type: 'tool-result',
					toolCallId: part.toolCallId,
					toolName: part.tool,
					output: {type: 'error-text', value: stringifyUnknown(part.error)}
				})
			}
		}
	}

	return [
		{role: 'assistant' as const, content: assistantContent},
		...(Array.isReadonlyArrayNonEmpty(toolContent) ? [{role: 'tool' as const, content: toolContent}] : [])
	]
})

const createPromptEvents = Effect.fnUntraced(function* (model: ModelSelection, parts: readonly PromptPart[]) {
	const messageId = crypto.randomUUID()
	const events = [] as ConversationEvent[]

	events.push(new MessageStartEvent({messageId, model, role: 'user', startedAt: Date.now()}))

	for (const part of parts) {
		const partId = crypto.randomUUID()
		if (part._tag === 'text') events.push(new TextDeltaEvent({messageId, partId, text: part.text}))
		if (part._tag === 'file') events.push(new FileEvent({messageId, partId, file: part.file}))
	}

	events.push(new MessageFinishEvent({messageId, finishReason: 'stop', usage: new Usage({})}))

	return events as readonly ConversationEvent[]
})

const createTools = Effect.fnUntraced(function* () {
	const exa = new Exa(yield* Config.string('AI_EXA'))

	return {
		question: {
			description: 'Ask the user follow-up questions and wait for a reply.',
			inputSchema: jsonSchema(Schema.toStandardJSONSchemaV1(QuestionTool.fields.input)),
			needsApproval: false
		},
		websearch: {
			description: 'Search the web and return a small set of relevant sources.',
			inputSchema: jsonSchema(Schema.toStandardJSONSchemaV1(WebsearchTool.fields.input)),
			needsApproval: true,
			execute: async (input: typeof WebsearchTool.fields.input.Type) => {
				const result = await exa.searchAndContents(input.query, {
					livecrawl: 'always',
					numResults: 3,
					text: {maxCharacters: 1000}
				})

				const sources = Array.map(result.results, source => ({
					title: source.title ?? undefined,
					url: source.url,
					publishedDate: source.publishedDate ?? undefined,
					text: source.text ?? undefined
				}))
				const [firstSource, ...restSources] = sources
				if (Predicate.isUndefined(firstSource)) throw new Error('No websearch sources returned')

				return Schema.encodeSync(WebsearchTool.fields.output)({
					query: input.query,
					sources: [firstSource, ...restSources]
				})
			}
		}
	}
})

const buildAssistantStream = Effect.fnUntraced(function* (
	selection: ModelSelection,
	history: readonly ConversationMessage[],
	tools: ReturnType<typeof createTools> extends Effect.Effect<infer A, infer _E, infer _R> ? A : never
) {
	const messageId = crypto.randomUUID()
	const languageModel = yield* resolveLanguageModel(selection)
	const modelMessages = Array.flatten(
		yield* Effect.forEach(history, conversationMessageToModelMessages, {concurrency: 'unbounded'})
	)
	const fullStream = streamText({model: languageModel, messages: modelMessages as never, tools}).fullStream

	return Stream.concat(
		Stream.succeed<ConversationEvent>(
			new MessageStartEvent({messageId, model: selection, role: 'assistant', startedAt: Date.now()})
		),
		pipe(
			Stream.fromAsyncIterable(fullStream, cause => new AiError({cause})),
			Stream.map(part => {
				if (part.type === 'text-delta') return new TextDeltaEvent({messageId, partId: part.id, text: part.text})
				if (part.type === 'reasoning-delta')
					return new ReasoningDeltaEvent({messageId, partId: part.id, text: part.text})
				if (part.type === 'file') {
					return new FileEvent({
						messageId,
						partId: crypto.randomUUID(),
						file: new globalThis.File([Buffer.from(part.file.base64, 'base64')], 'attachment', {
							type: part.file.mediaType
						})
					})
				}
				if (part.type === 'tool-call') {
					if (part.toolName === 'question' && isQuestionInput(part.input)) {
						return new ToolCallEvent({
							messageId,
							toolCallId: part.toolCallId,
							tool: 'question',
							input: part.input,
							state: 'pending-input'
						})
					}
					if (part.toolName === 'websearch' && isWebsearchInput(part.input)) {
						return new ToolCallEvent({
							messageId,
							toolCallId: part.toolCallId,
							tool: 'websearch',
							input: part.input,
							state: 'running'
						})
					}
					return undefined
				}
				if (part.type === 'tool-approval-request') {
					if (part.toolCall.toolName === 'question' && isQuestionInput(part.toolCall.input)) {
						return new ToolApprovalRequestEvent({
							messageId,
							toolCallId: part.toolCall.toolCallId,
							approvalId: part.approvalId,
							tool: 'question',
							input: part.toolCall.input
						})
					}
					if (part.toolCall.toolName === 'websearch' && isWebsearchInput(part.toolCall.input)) {
						return new ToolApprovalRequestEvent({
							messageId,
							toolCallId: part.toolCall.toolCallId,
							approvalId: part.approvalId,
							tool: 'websearch',
							input: part.toolCall.input
						})
					}
					return undefined
				}
				if (part.type === 'tool-result') {
					if (part.toolName === 'question' && isQuestionOutput(part.output)) {
						return new ToolResultEvent({messageId, toolCallId: part.toolCallId, tool: 'question', output: part.output})
					}
					if (part.toolName === 'websearch' && isWebsearchOutput(part.output)) {
						return new ToolResultEvent({messageId, toolCallId: part.toolCallId, tool: 'websearch', output: part.output})
					}
					return undefined
				}
				if (part.type === 'tool-error') {
					if (part.toolName === 'question') {
						return new ToolErrorEvent({messageId, toolCallId: part.toolCallId, tool: 'question', error: part.error})
					}
					if (part.toolName === 'websearch') {
						return new ToolErrorEvent({messageId, toolCallId: part.toolCallId, tool: 'websearch', error: part.error})
					}
					return undefined
				}
				if (part.type === 'tool-output-denied') {
					if (part.toolName === 'question') {
						return new ToolErrorEvent({
							messageId,
							toolCallId: part.toolCallId,
							tool: 'question',
							error: 'Tool execution denied.'
						})
					}
					if (part.toolName === 'websearch') {
						return new ToolErrorEvent({
							messageId,
							toolCallId: part.toolCallId,
							tool: 'websearch',
							error: 'Tool execution denied.'
						})
					}
					return undefined
				}
				if (part.type === 'finish') {
					return new MessageFinishEvent({
						messageId,
						finishReason: part.finishReason,
						usage: new Usage({
							input: part.totalUsage.inputTokens ?? 0,
							output: part.totalUsage.outputTokenDetails.textTokens ?? 0,
							reasoning: part.totalUsage.outputTokenDetails.reasoningTokens ?? 0
						})
					})
				}
				if (part.type === 'error') return new MessageErrorEvent({messageId, error: part.error})
				return undefined
			}),
			Stream.filter(Predicate.isNotNullish)
		)
	)
})

const publishEvents = Effect.fnUntraced(function* (
	history: Ref.Ref<readonly ConversationMessage[]>,
	events: PubSub.PubSub<ConversationEvent>,
	stream: Stream.Stream<ConversationEvent, AiError>
) {
	yield* pipe(
		stream,
		Stream.tap(event => Ref.update(history, messages => appendEvent(messages, event))),
		Stream.tap(event => PubSub.publish(events, event)),
		Stream.runDrain,
		Effect.mapError(cause => new AiError({cause}))
	)
})

export const AiSdkLive = Effect.gen(function* () {
	const tools = yield* createTools()
	const events = yield* PubSub.unbounded<ConversationEvent>({replay: 100_000})
	const history = yield* Ref.make<readonly ConversationMessage[]>([])
	const activeModel = yield* Ref.make<ModelSelection | undefined>(undefined)

	const runAssistant = Effect.gen(function* () {
		const currentHistory = yield* Ref.get(history)
		const currentModel = yield* Ref.get(activeModel)
		if (Predicate.isUndefined(currentModel)) {
			return yield* new AiError({message: 'No active model available for assistant run'})
		}
		const selection = currentModel
		yield* publishEvents(history, events, yield* buildAssistantStream(selection, currentHistory, tools))
	})

	return Agent.of({
		prompt: Effect.fnUntraced(function* (model: ModelSelection, parts: readonly PromptPart[]) {
			yield* Ref.set(activeModel, model)
			yield* publishEvents(history, events, Stream.fromIterable(yield* createPromptEvents(model, parts)))
			yield* runAssistant
		}),
		respond: Effect.fnUntraced(function* (response: AgentResponse) {
			yield* publishEvents(history, events, Stream.fromIterable([response]))
			yield* runAssistant
		}),
		stream: Stream.fromPubSub(events)
	})
})
