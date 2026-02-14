import {Config, Effect, Function, Option, pipe, Stream} from 'effect'

import {createOpenAI} from '@ai-sdk/openai'
import {createOpenRouter} from '@openrouter/ai-sdk-provider'
import {streamText} from 'ai'

import type {Model, ProviderId, StreamPart, UserMessage} from './schema.ts'
import {AiSdkError, File, fromAiSdkStreamPart, Start, TextDelta} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

const buildProviders = Effect.gen(function* () {
	return {
		opencode_zen: createOpenAI({
			name: 'opencode_zen',
			baseURL: 'https://opencode.ai/zen/v1',
			apiKey: yield* Config.string('AI_OPENCODE_ZEN')
		}),
		openrouter: createOpenRouter({
			baseURL: 'https://openrouter.ai/api/v1',
			apiKey: yield* Config.string('AI_OPENROUTER')
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
			stream: Effect.fnUntraced(function* (input: UserMessage) {
				const model = yield* pipe(
					resolveLanguageModel(input.model),
					Effect.mapError(cause => AiSdkError.make({cause}))
				)
				const userStartedAt = Date.now()
				const userParts: StreamPart[] = [
					Start.make({model: input.model, startedAt: userStartedAt, role: 'user'}),
					...(input.prompt.length > 0 ? [TextDelta.make({id: 'user', text: input.prompt}, true)] : []),
					...(input.attachments ?? []).map(attachment => File.make(attachment, true))
				]

				const {fullStream} = streamText({
					model,
					tools,
					activeTools: [],
					prompt: input.prompt,
					onError: Function.constVoid // already handled in the stream
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
