import { Schema } from 'effect'

// Stream Events
export class TextDeltaSchema extends Schema.TaggedClass<TextDeltaSchema>()('TextDeltaSchema', {
	text: Schema.String
}) {}

export class ReasoningDeltaSchema extends Schema.TaggedClass<ReasoningDeltaSchema>()('ReasoningDeltaSchema', {
	text: Schema.String
}) {}

export class ToolCallSchema extends Schema.TaggedClass<ToolCallSchema>()('ToolCallSchema', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	args: Schema.Unknown
}) {}

export class ToolResultSchema extends Schema.TaggedClass<ToolResultSchema>()('ToolResultSchema', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	result: Schema.Unknown,
	isError: Schema.optional(Schema.Boolean)
}) {}

export class FinishSchema extends Schema.TaggedClass<FinishSchema>()('FinishSchema', {
	reason: Schema.String,
	status: Schema.Literal('success', 'error', 'cancelled', 'incomplete'),
	usage: Schema.Struct({
		inputTokens: Schema.optional(Schema.Number),
		outputTokens: Schema.optional(Schema.Number),
		reasoningTokens: Schema.optional(Schema.Number),
		cacheReadTokens: Schema.optional(Schema.Number),
		cacheWriteTokens: Schema.optional(Schema.Number),
		totalTokens: Schema.optional(Schema.Number)
	})
}) {}

export class ErrorSchema extends Schema.TaggedClass<ErrorSchema>()('ErrorSchema', {
	error: Schema.Unknown
}) {}

export type AiParts = Schema.Schema.Type<typeof AiParts>
export const AiParts = Schema.Union(
	TextDeltaSchema,
	ReasoningDeltaSchema,
	ToolCallSchema,
	ToolResultSchema,
	FinishSchema,
	ErrorSchema
)
