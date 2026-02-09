import {Config, Effect, Option, pipe, Stream} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {type LanguageModel, ToolLoopAgent} from 'ai'

import type {AiInput, Model, ModelId, ProviderId, StreamPart} from './schema.ts'
import {AiSdkError, fromAiStreamPart, Start} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

const buildProviders = Effect.gen(function* () {
	return {
		opencode_zen: createOpenAICompatible({
			name: 'opencode_zen',
			baseURL: 'https://opencode.ai/zen/v1',
			apiKey: yield* Config.string('AI_OPENCODE_ZEN')
		})
	} satisfies Record<ProviderId, (model: ModelId) => LanguageModel>
})

export const resolveLanguageModel = (model: Model) =>
	Effect.gen(function* () {
		const providers = yield* buildProviders
		const provider: (model: ModelId) => LanguageModel = providers[model.provider]
		return provider(model.model)
	})

export class AiSdk extends Effect.Service<AiSdk>()('@ai-toolkit/ai/AiSdk', {
	accessors: true,
	effect: Effect.gen(function* () {
		const tools = {
			...(yield* webSearchToolSet)
		}

		return {
			stream: Effect.fnUntraced(function* (input: AiInput) {
				const agent = new ToolLoopAgent({
					model: yield* pipe(
						resolveLanguageModel(input.model),
						Effect.mapError(cause => AiSdkError.make({cause}))
					),
					tools
				})

				const {fullStream} = yield* Effect.tryPromise({
					try: () => agent.stream({prompt: input.prompt}),
					catch: cause => AiSdkError.make({cause})
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
