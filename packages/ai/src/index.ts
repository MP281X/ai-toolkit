import {Array, Config, Effect, Predicate, pipe, Schema, Stream} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import {streamText, type TextStreamPart, type ToolSet} from 'ai'

export type {TextStreamPart}

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
				function* () {
					const {fullStream} = streamText({
						model: zen('gpt-5-nano'),
						messages: [{role: 'assistant', content: [{type: 'text', text: 'return a 10 word phrase'}]}],
						tools: {}
					})

					return fullStream
				},
				Stream.fromEffect,
				Stream.flatMap(stream => Stream.fromAsyncIterable(stream, cause => AiSdkError.make({cause}))),
				Stream.filter(Predicate.isNotUndefined)
			)
		}
	})
}) {}

export const StreamToResponse = Effect.fnUntraced(function* <A, E, R>(stream: Stream.Stream<A, E, R>) {
	const encoder = new TextEncoder()

	const encodedStream = yield* pipe(
		stream,
		Stream.map(part => encoder.encode(`data: ${JSON.stringify(part)}\n\n`)),
		s => Stream.toReadableStreamEffect(s)
	)

	return new Response(encodedStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	})
})

export const AccumulateTextStream = <Tools extends ToolSet, Error, Requirements>(
	stream: Stream.Stream<TextStreamPart<Tools>, Error, Requirements>
) =>
	Stream.scan(stream, Array.empty<TextStreamPart<Tools>>(), (parts, part) => {
		if (part.type !== 'text-delta' && part.type !== 'reasoning-delta') return Array.append(parts, part)

		if (!Array.isNonEmptyArray(parts)) return Array.append(parts, part)

		const last = Array.lastNonEmpty(parts)

		if (last.type !== 'text-delta' && last.type !== 'reasoning-delta') return Array.append(parts, part)

		if (last.type !== part.type || last.id !== part.id) return Array.append(parts, part)

		return Array.append(Array.initNonEmpty(parts), {
			...last,
			text: last.text + part.text,
			providerMetadata: part.providerMetadata ?? last.providerMetadata
		})
	})
