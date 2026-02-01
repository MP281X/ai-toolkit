import {Config, Effect, Predicate, Schema, Stream} from 'effect'

import {createOpenAICompatible} from '@ai-sdk/openai-compatible'
import type {TextStreamPart} from 'ai'
import {streamText} from 'ai'

import {
	ErrorSchema,
	FinishSchema,
	ReasoningDeltaSchema,
	TextDeltaSchema,
	ToolCallSchema,
	ToolResultSchema
} from './schemas.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

const fromAiSdkStreamPart = (part: TextStreamPart<never>) => {
	switch (part.type) {
		case 'text-delta':
			return TextDeltaSchema.make({text: part.text})
		case 'reasoning-delta':
			return ReasoningDeltaSchema.make({text: part.text})
		case 'tool-call':
			return ToolCallSchema.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				args: 'input' in part ? part.input : {}
			})
		case 'tool-result':
			return ToolResultSchema.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				result: part.output,
				isError: undefined
			})
		case 'tool-error':
			return ToolResultSchema.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				result: part.error,
				isError: true
			})
		case 'finish':
			return FinishSchema.make({
				reason: part.finishReason,
				status: part.finishReason === 'error' ? 'error' : 'success',
				usage: {
					inputTokens: part.totalUsage.inputTokens,
					outputTokens: part.totalUsage.outputTokens,
					totalTokens: part.totalUsage.totalTokens,
					cacheReadTokens: part.totalUsage.inputTokenDetails.cacheReadTokens,
					cacheWriteTokens: part.totalUsage.inputTokenDetails.cacheWriteTokens
				}
			})
		case 'error':
			return ErrorSchema.make({error: part.error ?? new Error('Unknown error')})
		default:
			return undefined
	}
}

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
						messages: [{role: 'assistant', content: [{type: 'text', text: 'return a 3 letter word'}]}],
						tools: {}
					})

					return fullStream
				},
				Stream.fromEffect,
				Stream.flatMap(stream => Stream.fromAsyncIterable(stream, cause => AiSdkError.make({cause}))),
				Stream.map(fromAiSdkStreamPart),
				Stream.filter(Predicate.isNotUndefined)
			)
		}
	})
}) {}
