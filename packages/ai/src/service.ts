import {Array, Effect, Function, Option, Stream} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {streamText} from 'ai'

import {catalog, type Model} from './catalog.ts'
import type {StreamPart, UserMessage} from './schema.ts'
import {AiSdkError, File, fromAiSdkStreamPart, Start, TextDelta} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

const createModelAdapter = Effect.fnUntraced(
	function* (model: Model) {
		const providerConfig = catalog[model.provider]
		const modelConfig = yield* Array.findFirst(providerConfig.models, modelEntry => modelEntry.id === model.model)

		switch (modelConfig.adapter) {
			case 'openai': {
				return createOpenAI({
					name: model.provider,
					baseURL: providerConfig.baseUrl,
					apiKey: yield* providerConfig.apiKey
				})(model.model)
			}
			case 'anthropic': {
				return createAnthropic({
					name: model.provider,
					baseURL: providerConfig.baseUrl,
					apiKey: yield* providerConfig.apiKey
				})(model.model)
			}
			case 'openrouter': {
				return createOpenRouter({
					baseURL: providerConfig.baseUrl,
					apiKey: yield* providerConfig.apiKey
				})(model.model)
			}
			case 'openai-compatible': {
				return createOpenAICompatible({
					name: model.provider,
					baseURL: providerConfig.baseUrl,
					apiKey: yield* providerConfig.apiKey
				})(model.model)
			}
		}
	},
	Effect.catchTags({
		ConfigError: cause => new AiSdkError({cause}),
		NoSuchElementException: cause => new AiSdkError({cause})
	})
)

export class AiSdk extends Effect.Service<AiSdk>()('@ai-toolkit/ai/AiSdk', {
	accessors: true,
	effect: Effect.gen(function* () {
		const tools = {
			...(yield* webSearchToolSet)
		}

		return {
			stream: Effect.fnUntraced(function* (input: UserMessage) {
				const userParts: StreamPart[] = [
					Start.make({model: input.model, startedAt: Date.now(), role: 'user'}),
					...(input.prompt.length > 0 ? [TextDelta.make({id: 'user', text: input.prompt}, true)] : []),
					...(input.attachments ?? []).map(attachment => File.make(attachment, true))
				]

				const {fullStream} = streamText({
					model: yield* createModelAdapter(input.model),
					tools,
					activeTools: [],
					prompt: input.prompt,
					onError: Function.constVoid
				})

				return Stream.concat(
					Stream.fromIterable(userParts),
					Stream.concat(
						Stream.succeed<StreamPart>(Start.make({model: input.model, startedAt: Date.now(), role: 'assistant'})),
						Stream.filterMap(
							Stream.fromAsyncIterable(fullStream, cause => AiSdkError.make({cause})),
							part => Option.fromNullable(fromAiSdkStreamPart(part))
						)
					)
				)
			}, Stream.unwrap)
		}
	})
}) {}
