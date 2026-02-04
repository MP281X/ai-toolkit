import {Array, Config, Effect, flow, Option, Schema, Stream} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {streamText} from 'ai'

export * from './schema.ts'

import {fromAiTextStreamPart, type TextStreamPart} from './schema.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

export class AiSdk extends Effect.Service<AiSdk>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const zen = createOpenAICompatible({
			name: 'opencode_zen',
			baseURL: 'https://opencode.ai/zen/v1',
			apiKey: yield* Config.string('AI_OPENCODE_ZEN')
		})

		return {
			stream: Effect.fnUntraced(
				function* (input: {prompt: string}) {
					const {fullStream} = streamText({
						model: zen('gpt-5-nano'),
						messages: [{role: 'user', content: [{type: 'text', text: input.prompt}]}],
						tools: {}
					})

					return fullStream
				},
				Stream.fromEffect,
				Stream.flatMap(stream => Stream.fromAsyncIterable(stream, cause => AiSdkError.make({cause}))),
				Stream.filterMap(part => Option.fromNullable(fromAiTextStreamPart(part)))
			)
		}
	})
}) {}

export const AccumulateTextStream = flow(
	<A extends TextStreamPart, E, R>(stream: Stream.Stream<A, E, R>) => stream,
	Stream.scan(Array.empty<TextStreamPart>(), (parts, part) => {
		if (part._tag !== 'text-delta' && part._tag !== 'reasoning-delta') return Array.append(parts, part)

		if (!Array.isNonEmptyArray(parts)) return Array.append(parts, part)

		const last = Array.lastNonEmpty(parts)

		if (last._tag !== 'text-delta' && last._tag !== 'reasoning-delta') return Array.append(parts, part)

		if (last._tag !== part._tag || last.id !== part.id) return Array.append(parts, part)

		return Array.append(Array.initNonEmpty(parts), {...last, text: last.text + part.text})
	})
)
