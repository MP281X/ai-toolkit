import {Config, Effect, Function, Option, pipe, Stream} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {streamText} from 'ai'

import type {AiInput, Model, ProviderId, StreamPart} from './schema.ts'
import {AiSdkError, fromAiStreamPart, Start} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

const buildProviders = Effect.gen(function* () {
	return {
		opencode_zen: createOpenAICompatible({
			name: 'opencode_zen',
			baseURL: 'https://opencode.ai/zen/v1',
			apiKey: yield* Config.string('AI_OPENCODE_ZEN')
		})
	} satisfies Record<ProviderId, unknown>
})

export const resolveLanguageModel = Effect.fnUntraced(function* (model: Model) {
	const providers = yield* buildProviders
	return providers[model.provider](model.model)
})

export class AiSdk extends Effect.Service<AiSdk>()('@ai-toolkit/ai/AiSdk', {
	accessors: true,
	effect: Effect.gen(function* () {
		const tools = {
			...(yield* webSearchToolSet)
		}

		return {
			stream: Effect.fnUntraced(function* (input: AiInput) {
				const model = yield* pipe(
					resolveLanguageModel(input.model),
					Effect.mapError(cause => AiSdkError.make({cause}))
				)

				const {fullStream} = streamText({
					model,
					tools,
					prompt: input.prompt,
					onError: Function.constVoid // already handled in the stream
				})

				return Stream.concat(
					Stream.succeed<StreamPart>(Start.make({model: input.model, startedAt: Date.now(), role: 'assistant'})),
					Stream.filterMap(
						Stream.fromAsyncIterable(fullStream, cause => AiSdkError.make({cause})),
						part => Option.fromNullable(fromAiStreamPart(part))
					)
				)
			}, Stream.unwrap)
		}
	})
}) {}
