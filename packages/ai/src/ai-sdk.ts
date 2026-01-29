import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { Config, Effect, Predicate, Schema, Stream } from 'effect'
import { fromAiSdkStreamPart } from './mappers/vercel.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

export class AiClient extends Effect.Service<AiClient>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const openai = createOpenAI({
			apiKey: yield* Config.string('AI_OPENCODE_ZEN'),
			baseURL: 'https://opencode.ai/zen/v1'
		})

		return {
			stream: Effect.fnUntraced(
				function* () {
					const { fullStream } = streamText({
						model: openai.chat('gpt-5-nano'),
						messages: [
							{ role: 'assistant', content: [{ type: 'text', text: 'write a 3 letter word that starts with A' }] }
						],
						tools: {}
					})

					return fullStream
				},
				Stream.fromEffect,
				Stream.flatMap(stream => Stream.fromAsyncIterable(stream, cause => AiSdkError.make({ cause }))),
				Stream.map(fromAiSdkStreamPart),
				Stream.filter(Predicate.isNotUndefined)
			)
		}
	})
}) {}
