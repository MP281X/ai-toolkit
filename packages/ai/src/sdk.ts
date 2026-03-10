import {Array, Effect, Option, Predicate, PubSub, pipe, Ref, Schema, Stream, String} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {
	type AssistantModelMessage,
	type FilePart,
	type LanguageModelUsage,
	type ModelMessage,
	streamText,
	type ToolApprovalRequest,
	type ToolApprovalResponse,
	type ToolCallPart,
	type ToolModelMessage,
	type ToolResultPart,
	tool,
	type UserModelMessage
} from 'ai'
import {Exa} from 'exa-js'

import {type ModelSelection, models, providers} from './catalog.ts'
import {
	type AgentResponse,
	AiError,
	type ConversationEvent,
	type ConversationMessage,
	FileEvent,
	MessageErrorEvent,
	MessageFinishEvent,
	MessageStartEvent,
	type PromptPart,
	QuestionCallEvent,
	ReasoningDeltaEvent,
	reconstructMessages,
	TextDeltaEvent,
	ToolApprovalRequestEvent,
	ToolErrorEvent,
	Usage,
	WebsearchCallEvent,
	WebsearchResultEvent
} from './schema.ts'
import {effectSchema, QuestionTool, WebsearchTool} from './tool.ts'

const stringifyError = (error: unknown) => (error instanceof Error ? error.message : `${error}`)
const decodeQuestionInput = Schema.decodeUnknownSync(QuestionTool.fields.input)
const decodeWebsearchInput = Schema.decodeUnknownSync(WebsearchTool.fields.input)
const decodeWebsearchOutput = Schema.decodeUnknownSync(WebsearchTool.fields.output)

const fileContent = Effect.fnUntraced(function* (file: globalThis.File) {
	const buf = yield* Effect.tryPromise({
		try: () => file.arrayBuffer(),
		catch: cause => new AiError({message: 'failed to read attachment', cause: stringifyError(cause)})
	})

	const content: FilePart = {
		type: 'file',
		data: Buffer.from(buf).toString('base64'),
		mediaType: String.isNonEmpty(file.type) ? file.type : 'application/octet-stream',
		filename: file.name
	}

	return content
})

const usage = (raw: LanguageModelUsage) =>
	new Usage({
		input: raw.inputTokens ?? 0,
		output: raw.outputTokens ?? 0,
		reasoning: raw.reasoningTokens ?? 0
	})

const modelInfo = (sel: ModelSelection) =>
	Option.getOrUndefined(
		Array.findFirst(
			models,
			item => item.agent === sel.agent && item.provider === sel.provider && item.model === sel.model
		)
	)

const providerInfo = (id: (typeof providers)[number]['id']) =>
	Option.getOrUndefined(Array.findFirst(providers, item => item.id === id))

const resolveModel = (sel: ModelSelection) =>
	Effect.gen(function* () {
		const info = modelInfo(sel)
		if (Predicate.isUndefined(info)) return yield* new AiError({message: 'selected model not found'})

		const cfg = providerInfo(info.provider)
		if (Predicate.isUndefined(cfg)) return yield* new AiError({message: 'selected provider not found'})

		const apiKey = Predicate.isNotNullish(cfg.apiKeyEnv) ? process.env[cfg.apiKeyEnv] : undefined
		if (Predicate.isNotNullish(cfg.apiKeyEnv) && String.isEmpty(apiKey ?? '')) {
			return yield* new AiError({message: `missing API key: ${cfg.apiKeyEnv}`})
		}

		switch (info.adapter) {
			case 'openai':
				return createOpenAI(
					Predicate.isNotNullish(apiKey) ? {apiKey, baseURL: cfg.baseUrl} : {baseURL: cfg.baseUrl}
				).languageModel(info.model)
			case 'anthropic':
				return createAnthropic(
					Predicate.isNotNullish(apiKey) ? {apiKey, baseURL: cfg.baseUrl} : {baseURL: cfg.baseUrl}
				).languageModel(info.model)
			case 'openrouter':
				return createOpenRouter(
					Predicate.isNotNullish(apiKey) ? {apiKey, baseURL: cfg.baseUrl} : {baseURL: cfg.baseUrl}
				).languageModel(info.model)
			case 'openai-compatible':
			case 'opencode':
				return createOpenAICompatible(
					Predicate.isNotNullish(apiKey)
						? {name: info.provider, apiKey, baseURL: cfg.baseUrl}
						: {name: info.provider, baseURL: cfg.baseUrl}
				).languageModel(info.model)
		}
	})

const questionDef = tool({
	description: 'Ask the user a follow-up question',
	inputSchema: effectSchema(QuestionTool.fields.input)
})

const websearchDef = (exa: Exa) =>
	tool({
		description: 'Search the web for current information',
		inputSchema: effectSchema(WebsearchTool.fields.input),
		outputSchema: effectSchema(WebsearchTool.fields.output),
		needsApproval: true,
		execute: async input => {
			const req = decodeWebsearchInput(input)
			const res = await exa.searchAndContents(req.query, {numResults: 5, text: true})
			const sources = pipe(
				Array.fromIterable(res.results),
				Array.map(item => ({
					url: item.url,
					...(Predicate.isNotNullish(item.title) && String.isNonEmpty(item.title) ? {title: item.title} : {}),
					...(Predicate.isNotNullish(item.publishedDate) && String.isNonEmpty(item.publishedDate)
						? {publishedDate: item.publishedDate}
						: {}),
					...(Predicate.isNotNullish(item.text) ? {text: item.text.slice(0, 300)} : {})
				})),
				Array.filter(item => String.isNonEmpty(item.url)),
				Array.take(3)
			)

			if (Array.isReadonlyArrayEmpty(sources)) {
				return decodeWebsearchOutput({sources: [{url: 'https://exa.ai'}]})
			}

			return decodeWebsearchOutput({sources})
		}
	})

const questionToolCallPart = (toolCallId: string, input: typeof QuestionTool.fields.input.Type) => {
	const content: ToolCallPart = {type: 'tool-call', toolCallId, toolName: 'question', input}
	return content
}

const websearchToolCallPart = (toolCallId: string, input: typeof WebsearchTool.fields.input.Type) => {
	const content: ToolCallPart = {type: 'tool-call', toolCallId, toolName: 'websearch', input}
	return content
}

const approvalRequestPart = (approvalId: string, toolCallId: string) => {
	const content: ToolApprovalRequest = {type: 'tool-approval-request', approvalId, toolCallId}
	return content
}

const questionOutputValue = (output: typeof QuestionTool.fields.output.Type) => ({
	answers: Array.fromIterable(output.answers).map(answer => Array.fromIterable(answer))
})

const websearchOutputValue = (output: typeof WebsearchTool.fields.output.Type) => ({
	sources: Array.fromIterable(output.sources).map(source => ({
		url: source.url,
		...(Predicate.isNotNullish(source.title) ? {title: source.title} : {}),
		...(Predicate.isNotNullish(source.publishedDate) ? {publishedDate: source.publishedDate} : {}),
		...(Predicate.isNotNullish(source.text) ? {text: source.text} : {})
	}))
})

const questionToolResultPart = (toolCallId: string, output: typeof QuestionTool.fields.output.Type) => {
	const content: ToolResultPart = {
		type: 'tool-result',
		toolCallId,
		toolName: 'question',
		output: {type: 'json', value: questionOutputValue(output)}
	}
	return content
}

const websearchToolResultPart = (toolCallId: string, output: typeof WebsearchTool.fields.output.Type) => {
	const content: ToolResultPart = {
		type: 'tool-result',
		toolCallId,
		toolName: 'websearch',
		output: {type: 'json', value: websearchOutputValue(output)}
	}
	return content
}

const approvalResponsePart = (approvalId: string, approved: boolean) => {
	const content: ToolApprovalResponse = {type: 'tool-approval-response', approvalId, approved}
	return content
}

const assistantContent = Effect.fnUntraced(function* (parts: ConversationMessage['parts']) {
	const out: Exclude<AssistantModelMessage['content'], string> = []
	for (const part of parts) {
		switch (part._tag) {
			case 'text':
				out.push({type: 'text', text: part.text})
				break
			case 'reasoning':
				out.push({type: 'reasoning', text: part.text})
				break
			case 'file':
				out.push(yield* fileContent(part.file))
				break
			case 'question':
				out.push(questionToolCallPart(part.toolCallId, part.input))
				break
			case 'websearch':
				out.push(websearchToolCallPart(part.toolCallId, part.input))
				if (Predicate.isNotNullish(part.approvalId)) {
					out.push(approvalRequestPart(part.approvalId, part.toolCallId))
				}
				break
			case 'error':
				break
		}
	}
	return out
})

const toolContent = (parts: ConversationMessage['parts']) => {
	const out: ToolModelMessage['content'] = []
	for (const part of parts) {
		switch (part._tag) {
			case 'question':
				if (part.state === 'completed' && Predicate.isNotNullish(part.output)) {
					out.push(questionToolResultPart(part.toolCallId, part.output))
				}
				break
			case 'websearch':
				if ((part.state === 'running' || part.state === 'completed') && Predicate.isNotNullish(part.approvalId)) {
					out.push(approvalResponsePart(part.approvalId, true))
				}
				if (part.state === 'denied' && Predicate.isNotNullish(part.approvalId)) {
					out.push(approvalResponsePart(part.approvalId, false))
				}
				if (part.state === 'completed' && Predicate.isNotNullish(part.output)) {
					out.push(websearchToolResultPart(part.toolCallId, part.output))
				}
				break
			default:
				break
		}
	}
	return out
}

const historyMessages = Effect.fnUntraced(function* (events: readonly ConversationEvent[]) {
	const msgs = reconstructMessages(events)
	const out: ModelMessage[] = []

	for (const message of msgs) {
		if (message.role === 'user') {
			const content: Exclude<UserModelMessage['content'], string> = []
			for (const part of message.parts) {
				if (part._tag === 'text') content.push({type: 'text', text: part.text})
				if (part._tag === 'file') content.push(yield* fileContent(part.file))
			}
			if (Array.isReadonlyArrayNonEmpty(content)) {
				const userMessage: UserModelMessage = {role: 'user', content}
				out.push(userMessage)
			}
			continue
		}

		const assistant = yield* assistantContent(message.parts)
		const tool = toolContent(message.parts)
		if (Array.isReadonlyArrayNonEmpty(assistant)) {
			const assistantMessage: AssistantModelMessage = {role: 'assistant', content: assistant}
			out.push(assistantMessage)
		}
		if (Array.isReadonlyArrayNonEmpty(tool)) {
			const toolMessage: ToolModelMessage = {role: 'tool', content: tool}
			out.push(toolMessage)
		}
	}

	return out
})

const publish = (
	ref: Ref.Ref<readonly ConversationEvent[]>,
	bus: PubSub.PubSub<ConversationEvent>,
	event: ConversationEvent
) =>
	Effect.all([Ref.update(ref, events => [...events, event]), PubSub.publish(bus, event)], {
		concurrency: 'unbounded'
	}).pipe(Effect.asVoid)

const replay = (ref: Ref.Ref<readonly ConversationEvent[]>, bus: PubSub.PubSub<ConversationEvent>) =>
	Stream.unwrap(Effect.map(Ref.get(ref), events => Stream.concat(Stream.fromIterable(events), Stream.fromPubSub(bus))))

const responseModel = (events: readonly ConversationEvent[], messageId: string) => {
	const message = Option.getOrUndefined(Array.findFirst(reconstructMessages(events), item => item.id === messageId))
	if (Predicate.isUndefined(message)) return
	return message.model
}

export const AgentLive = Effect.gen(function* () {
	const key = process.env['AI_EXA']
	if (String.isEmpty(key ?? '')) return yield* new AiError({message: 'missing API key: AI_EXA'})

	const exa = new Exa(key)
	const initialEvents: readonly ConversationEvent[] = []
	const ref = yield* Ref.make(initialEvents)
	const bus = yield* PubSub.unbounded<ConversationEvent>()
	const emit = (event: ConversationEvent) => publish(ref, bus, event)

	const run = (sel: ModelSelection, messages: ModelMessage[], messageId: string, sendStart: boolean) =>
		Effect.gen(function* () {
			if (sendStart) {
				yield* emit(new MessageStartEvent({messageId, model: sel, role: 'assistant', startedAt: Date.now()}))
			}

			const model = yield* resolveModel(sel)
			const out = streamText({
				model,
				messages,
				tools: {question: questionDef, websearch: websearchDef(exa)}
			})

			yield* pipe(
				Stream.fromAsyncIterable(
					out.fullStream,
					cause => new AiError({message: 'stream failed', cause: stringifyError(cause)})
				),
				Stream.runForEach(part => {
					switch (part.type) {
						case 'text-delta':
							return emit(new TextDeltaEvent({messageId, partId: part.id, text: part.text}))
						case 'reasoning-delta':
							return emit(new ReasoningDeltaEvent({messageId, partId: part.id, text: part.text}))
						case 'file':
							return emit(
								new FileEvent({
									messageId,
									partId: crypto.randomUUID(),
									file: new File([Buffer.from(part.file.base64, 'base64')], `attachment-${Date.now()}`, {
										type: part.file.mediaType
									})
								})
							)
						case 'tool-call':
							if (part.toolName === 'question') {
								return emit(
									new QuestionCallEvent({
										messageId,
										toolCallId: part.toolCallId,
										input: decodeQuestionInput(part.input)
									})
								)
							}
							if (part.toolName === 'websearch') {
								return emit(
									new WebsearchCallEvent({
										messageId,
										toolCallId: part.toolCallId,
										input: decodeWebsearchInput(part.input)
									})
								)
							}
							return Effect.void
						case 'tool-approval-request':
							switch (part.toolCall.toolName) {
								case 'question':
								case 'websearch':
									return emit(
										new ToolApprovalRequestEvent({
											messageId,
											toolCallId: part.toolCall.toolCallId,
											approvalId: part.approvalId,
											tool: part.toolCall.toolName
										})
									)
								default:
									return Effect.void
							}
						case 'tool-result':
							if (part.toolName === 'websearch') {
								return emit(
									new WebsearchResultEvent({
										messageId,
										toolCallId: part.toolCallId,
										output: decodeWebsearchOutput(part.output)
									})
								)
							}
							return Effect.void
						case 'tool-error':
							switch (part.toolName) {
								case 'question':
								case 'websearch':
									return emit(
										new ToolErrorEvent({
											messageId,
											toolCallId: part.toolCallId,
											tool: part.toolName,
											error: stringifyError(part.error)
										})
									)
								default:
									return Effect.void
							}
						case 'finish':
							return emit(
								new MessageFinishEvent({messageId, finishReason: part.finishReason, usage: usage(part.totalUsage)})
							)
						case 'error':
							return emit(new MessageErrorEvent({messageId, error: stringifyError(part.error)}))
						default:
							return Effect.void
					}
				})
			)
		})

	const prompt = (sel: ModelSelection, parts: readonly PromptPart[]) =>
		Effect.gen(function* () {
			const id = crypto.randomUUID()
			yield* emit(new MessageStartEvent({messageId: id, model: sel, role: 'user', startedAt: Date.now()}))
			for (const part of parts) {
				if (part._tag === 'text') {
					yield* emit(new TextDeltaEvent({messageId: id, partId: crypto.randomUUID(), text: part.text}))
				}
				if (part._tag === 'file') {
					yield* emit(new FileEvent({messageId: id, partId: crypto.randomUUID(), file: part.file}))
				}
			}
			yield* emit(new MessageFinishEvent({messageId: id, finishReason: 'stop', usage: new Usage({})}))

			const history = yield* Ref.get(ref)
			const messages = yield* historyMessages(history)
			yield* run(sel, messages, crypto.randomUUID(), true)
		})

	const respond = (response: AgentResponse) =>
		Effect.gen(function* () {
			yield* emit(response)
			const history = yield* Ref.get(ref)
			const sel = responseModel(history, response.messageId)
			if (Predicate.isUndefined(sel)) return yield* new AiError({message: 'response target message not found'})
			const messages = yield* historyMessages(history)
			yield* run(sel, messages, response.messageId, false)
		})

	return {prompt, respond, stream: replay(ref, bus)}
})
