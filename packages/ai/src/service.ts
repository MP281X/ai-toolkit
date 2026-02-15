import {Config, Effect, Function, Option, pipe, Stream} from 'effect'

import {createAnthropic} from '@ai-sdk/anthropic'
import {createOpenAI} from '@ai-sdk/openai'
import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {type LanguageModel, streamText} from 'ai'

import type {AdapterId, ModelId, StreamPart, UserMessage} from './schema.ts'
import {AiSdkError, File, fromAiSdkStreamPart, Model, Start, TextDelta} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

export class AiSdk extends Effect.Service<AiSdk>()('@ai-toolkit/ai/AiSdk', {
	accessors: true,
	effect: Effect.gen(function* () {
		const opencodeKey = yield* Config.string('AI_OPENCODE_ZEN')
		const openrouterKey = yield* Config.string('AI_OPENROUTER')
		const tools = {...(yield* webSearchToolSet)}

		const adapters: Record<AdapterId, (modelId: ModelId) => LanguageModel> = {
			openai: createOpenAI({name: 'opencode_zen', baseURL: 'https://opencode.ai/zen/v1', apiKey: opencodeKey}),
			openrouter: createOpenRouter({baseURL: 'https://openrouter.ai/api/v1', apiKey: openrouterKey}),
			anthropic: createAnthropic({baseURL: 'https://openrouter.ai/api/v1', apiKey: opencodeKey}),
			'openai-compatible': createOpenAICompatible({
				baseURL: 'https://openrouter.ai/api/v1',
				apiKey: opencodeKey,
				name: 'zen'
			})
		}

		return {
			stream: Effect.fnUntraced(function* (input: UserMessage) {
				const userParts: StreamPart[] = [
					Start.make({model: input.model, startedAt: Date.now(), role: 'user'}),
					...(input.prompt.length > 0 ? [TextDelta.make({id: 'user', text: input.prompt}, true)] : []),
					...(input.attachments ?? []).map(attachment => File.make(attachment, true))
				]

				const {fullStream} = streamText({
					model: yield* pipe(
						Model.resolveModel(input.model),
						Effect.andThen(model => adapters[model.adapter](model.id))
					),
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
