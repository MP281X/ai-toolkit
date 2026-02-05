import {Schema} from 'effect'

import type {TextStreamPart as AiTextStreamPart, ToolSet} from 'ai'

export const FinishReason = Schema.Literal('stop', 'length', 'content-filter', 'tool-calls', 'error', 'other')
export type FinishReason = typeof FinishReason.Type

export const Usage = Schema.Struct({
	inputTokens: Schema.optional(Schema.Number),
	inputTokenDetails: Schema.Struct({
		noCacheTokens: Schema.optional(Schema.Number),
		cacheReadTokens: Schema.optional(Schema.Number),
		cacheWriteTokens: Schema.optional(Schema.Number)
	}),
	outputTokens: Schema.optional(Schema.Number),
	outputTokenDetails: Schema.Struct({
		textTokens: Schema.optional(Schema.Number),
		reasoningTokens: Schema.optional(Schema.Number)
	}),
	totalTokens: Schema.optional(Schema.Number),
	reasoningTokens: Schema.optional(Schema.Number),
	cachedInputTokens: Schema.optional(Schema.Number),
	raw: Schema.optional(Schema.Unknown)
})
export type Usage = typeof Usage.Type

export class TextDelta extends Schema.TaggedClass<TextDelta>()('text-delta', {
	id: Schema.String,
	text: Schema.String
}) {}

export class ReasoningDelta extends Schema.TaggedClass<ReasoningDelta>()('reasoning-delta', {
	id: Schema.String,
	text: Schema.String
}) {}

export class ToolCall extends Schema.TaggedClass<ToolCall>()('tool-call', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown
}) {}

export class ToolResult extends Schema.TaggedClass<ToolResult>()('tool-result', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	output: Schema.Unknown
}) {}

export class ToolError extends Schema.TaggedClass<ToolError>()('tool-error', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	error: Schema.Unknown
}) {}

export class Finish extends Schema.TaggedClass<Finish>()('finish', {
	finishReason: FinishReason,
	usage: Usage
}) {}

export class Error extends Schema.TaggedClass<Error>()('error', {
	error: Schema.Unknown
}) {}

export type TextStreamPart = typeof TextStreamPart.Type
export const TextStreamPart = Schema.Union(TextDelta, ReasoningDelta, ToolCall, ToolResult, ToolError, Finish, Error)

export const Message = Schema.Struct({
	id: Schema.String,
	providerId: Schema.String,
	modelId: Schema.String,
	role: Schema.Literal('user', 'assistant', 'system'),
	parts: Schema.Array(TextStreamPart),
	finishReason: Schema.optional(FinishReason),
	usage: Schema.optional(Usage)
})
export type Message = typeof Message.Type

export const fromAiTextStreamPart = <T extends ToolSet>(part: AiTextStreamPart<T>) => {
	switch (part.type) {
		case 'text-delta':
			return TextDelta.make(part)
		case 'reasoning-delta':
			return ReasoningDelta.make(part)
		case 'tool-call':
			return ToolCall.make(part)
		case 'tool-result':
			return ToolResult.make(part)
		case 'tool-error':
			return ToolError.make(part)
		case 'finish':
			return Finish.make({finishReason: part.finishReason, usage: part.totalUsage})
		case 'error':
			return Error.make(part)
		default:
			return null
	}
}
