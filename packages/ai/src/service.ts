import {Array, Effect, Function, Match, Option, pipe, Stream, SubscriptionRef} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type TextStreamPart as AiSdkTextStreamPart, streamText, type ToolSet} from 'ai'

import {catalog, type ModelId, type ProviderId} from './catalog.ts'
import {
	AiSdkError,
	ConversationMessage,
	conversationMessageToModelMessage,
	type ModelMessage,
	modelMessageToSdk,
	partsStreamToMessage,
	Start,
	type StreamPart,
	sdkStreamPartToStreamPart,
	type ToolContent,
	ToolModelMessage,
	type UserContentPart
} from './schema.ts'
import {questionToolSet} from './tools/question.ts'
import {webSearchToolSet} from './tools/web-search.ts'

export class Model extends Effect.Service<Model>()('@ai-toolkit/ai/Model', {
	accessors: true,
	scoped: Effect.fnUntraced(function* (input: {provider: ProviderId; model: ModelId}) {
		const {models, baseURL, apiKey} = catalog[input.provider]

		const {adapter} = yield* pipe(
			Array.findFirst(models, modelEntry => modelEntry.id === input.model),
			Option.match({
				onSome: model => Effect.succeed(model),
				onNone: () => new AiSdkError({message: 'Model not found'})
			})
		)

		const config = {
			baseURL,
			name: input.provider,
			apiKey: yield* Effect.mapError(apiKey, cause => new AiSdkError({cause}))
		}

		const languageModel = Match.value(adapter).pipe(
			Match.when('openai', () => createOpenAI()(input.model)),
			Match.when('openai-compatible', () => createOpenAICompatible(config)(input.model)),
			Match.when('anthropic', () => createAnthropic(config)(input.model)),
			Match.when('openrouter', () => createOpenRouter(config)(input.model)),
			Match.exhaustive
		)

		return {provider: input.provider, model: input.model, languageModel} as const
	})
}) {}

export class Agent extends Effect.Service<Agent>()('@ai-toolkit/ai/Agent', {
	accessors: true,
	effect: Effect.gen(function* () {
		const tools = {
			...(yield* webSearchToolSet),
			...(yield* questionToolSet)
		}
		const messageRef = yield* SubscriptionRef.make<ConversationMessage[]>([])

		function upsertMessage(messages: ConversationMessage[], message: ConversationMessage) {
			const last = messages[messages.length - 1]
			if (last && last.startedAt === message.startedAt && last.role === message.role)
				return [...messages.slice(0, -1), message]
			return [...messages, message]
		}

		function appendHistory<R>(stream: Stream.Stream<StreamPart, AiSdkError, R>) {
			return pipe(
				stream,
				partsStreamToMessage,
				Stream.flatMap(message => SubscriptionRef.update(messageRef, current => upsertMessage(current, message))),
				Stream.runDrain
			)
		}

		function buildStream(
			model: {provider: string; model: string; languageModel: Parameters<typeof streamText>[0]['model']},
			messages: ModelMessage[]
		) {
			const {fullStream} = streamText({
				model: model.languageModel,
				tools,
				messages: messages.map(modelMessageToSdk),
				onError: Function.constVoid
			})
			return Stream.concat(
				Stream.succeed(
					Start.make({
						model: {provider: model.provider as ProviderId, model: model.model as ModelId},
						startedAt: Date.now(),
						role: 'assistant'
					})
				),
				pipe(
					Stream.fromAsyncIterable<AiSdkTextStreamPart<ToolSet>, AiSdkError>(fullStream, cause =>
						AiSdkError.make({cause})
					),
					Stream.filterMap(part => Option.fromNullable(sdkStreamPartToStreamPart(part)))
				)
			)
		}

		return {
			prompt: Effect.fnUntraced(function* (parts: UserContentPart[]) {
				const model = yield* Model
				const startedAt = Date.now()
				yield* SubscriptionRef.update(messageRef, current => [
					...current,
					ConversationMessage.make({
						model: {provider: model.provider, model: model.model},
						startedAt,
						role: 'user',
						parts: [...parts]
					})
				])
				const history = yield* SubscriptionRef.get(messageRef)
				yield* appendHistory(buildStream(model, history.map(conversationMessageToModelMessage)))
			}),
			respond: Effect.fnUntraced(function* (response: ToolContent) {
				const model = yield* Model
				const history = yield* SubscriptionRef.get(messageRef)
				yield* appendHistory(
					buildStream(model, [
						...history.map(conversationMessageToModelMessage),
						ToolModelMessage.make({content: [response]})
					])
				)
			}),
			history: messageRef.changes
		}
	})
}) {}
