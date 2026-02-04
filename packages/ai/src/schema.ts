import {Schema} from 'effect'

import type {TextStreamPart as AiTextStreamPart} from 'ai'

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
	finishReason: Schema.String,
	totalUsage: Schema.Struct({
		inputTokens: Schema.optional(Schema.Number),
		outputTokens: Schema.optional(Schema.Number),
		totalTokens: Schema.optional(Schema.Number),
		inputTokenDetails: Schema.Struct({
			cacheReadTokens: Schema.optional(Schema.Number),
			cacheWriteTokens: Schema.optional(Schema.Number)
		}),
		outputTokenDetails: Schema.Struct({
			reasoningTokens: Schema.optional(Schema.Number)
		})
	})
}) {}

export class Error extends Schema.TaggedClass<Error>()('error', {
	error: Schema.Unknown
}) {}

export type TextStreamPart = typeof TextStreamPart.Type
export const TextStreamPart = Schema.Union(TextDelta, ReasoningDelta, ToolCall, ToolResult, ToolError, Finish, Error)

export const fromAiTextStreamPart = (part: AiTextStreamPart<any>) => {
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
			return Finish.make(part)
		case 'error':
			return Error.make(part)
		default:
			return null
	}
}
