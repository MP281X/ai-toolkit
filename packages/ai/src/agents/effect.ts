import type {Layer} from 'effect'
import {Effect, Option, pipe, Queue, Ref, Stream, Struct} from 'effect'

import type {AiError, LanguageModel, Response} from 'effect/unstable/ai'
import {Chat, Prompt} from 'effect/unstable/ai'
import type {HttpClient} from 'effect/unstable/http'

import {partsStreamSanitizer} from '#lib/utils.ts'
import {AgentToolKit} from '#tools/contracts.ts'
import {WebFetchToolKitLayer, WebSearchToolKitLayer} from '#tools/handlers.ts'
import {Agent} from '../service.ts'

export const makeLayerEffect = pipe(
	Effect.gen(function* () {
		const services = yield* Effect.context<
			| LanguageModel.LanguageModel
			| Layer.Success<typeof WebSearchToolKitLayer>
			| Layer.Success<typeof WebFetchToolKitLayer>
			| HttpClient.HttpClient
		>()

		const chat = yield* Chat.empty

		return Agent.of({
			history: pipe(Ref.get(chat.history), Effect.map(Struct.get('content'))),
			streamText: messages =>
				Stream.callback<Response.StreamPart<typeof AgentToolKit.tools>, AiError.AiError>(
					Effect.fnUntraced(function* (queue) {
						let prompt = Prompt.fromMessages(messages)

						while (true) {
							const last = yield* pipe(
								chat.streamText({prompt, toolkit: AgentToolKit}),
								partsStreamSanitizer,
								Stream.tap(part => Queue.offer(queue, part)),
								Stream.provideContext(services),
								Stream.runLast
							)

							if (Option.isSome(last) && last.value.type === 'finish' && last.value.reason === 'tool-calls') {
								prompt = Prompt.empty
								continue
							}

							return yield* Queue.end(queue)
						}
					})
				)
		})
	}),
	Effect.provide(WebSearchToolKitLayer),
	Effect.provide(WebFetchToolKitLayer)
)
