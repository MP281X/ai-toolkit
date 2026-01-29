import { Schema } from 'effect'

// Parts
export class AiTextPart extends Schema.TaggedClass<AiTextPart>()('AiTextPart', { text: Schema.String }) {}

export class AiReasoningPart extends Schema.TaggedClass<AiReasoningPart>()('AiReasoningPart', {
	text: Schema.optional(Schema.String)
}) {}

export class AiToolCallPart extends Schema.TaggedClass<AiToolCallPart>()('AiToolCallPart', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	args: Schema.Unknown
}) {}

export class AiToolResultPart extends Schema.TaggedClass<AiToolResultPart>()('AiToolResultPart', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	result: Schema.Unknown,
	isError: Schema.optional(Schema.Boolean)
}) {}

export const AiPart = Schema.Union(AiTextPart, AiReasoningPart, AiToolCallPart, AiToolResultPart)

// Usage
export class AiUsage extends Schema.Class<AiUsage>('AiUsage')({
	inputTokens: Schema.optional(Schema.Number),
	outputTokens: Schema.optional(Schema.Number),
	reasoningTokens: Schema.optional(Schema.Number),
	cacheReadTokens: Schema.optional(Schema.Number),
	cacheWriteTokens: Schema.optional(Schema.Number),
	totalTokens: Schema.optional(Schema.Number)
}) {}

// Finish/Error
export class AiError extends Schema.TaggedClass<AiError>()('AiError', {
	cause: Schema.Unknown,
	message: Schema.optional(Schema.String)
}) {}

export class AiFinish extends Schema.Class<AiFinish>('AiFinish')({
	reason: Schema.String,
	status: Schema.Literal('success', 'error', 'cancelled', 'incomplete')
}) {}

// Message
export class AiMessage extends Schema.Class<AiMessage>('AiMessage')({
	id: Schema.String,
	sessionId: Schema.optional(Schema.String),
	role: Schema.Literal('user', 'assistant', 'tool', 'system'),
	createdAt: Schema.optional(Schema.String),
	parts: Schema.Array(AiPart),
	usage: Schema.optional(AiUsage),
	finish: Schema.optional(AiFinish),
	error: Schema.optional(AiError)
}) {}

// Stream Events
export class AiStreamTextDelta extends Schema.TaggedClass<AiStreamTextDelta>()('AiStreamTextDelta', {
	text: Schema.String
}) {}

export class AiStreamReasoningDelta extends Schema.TaggedClass<AiStreamReasoningDelta>()('AiStreamReasoningDelta', {
	text: Schema.String
}) {}

export class AiStreamToolCall extends Schema.TaggedClass<AiStreamToolCall>()('AiStreamToolCall', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	args: Schema.Unknown
}) {}

export class AiStreamToolResult extends Schema.TaggedClass<AiStreamToolResult>()('AiStreamToolResult', {
	toolCallId: Schema.String,
	toolName: Schema.String,
	result: Schema.Unknown,
	isError: Schema.optional(Schema.Boolean)
}) {}

export class AiStreamFinish extends Schema.TaggedClass<AiStreamFinish>()('AiStreamFinish', {
	finish: AiFinish,
	usage: Schema.optional(AiUsage)
}) {}

export class AiStreamError extends Schema.TaggedClass<AiStreamError>()('AiStreamError', {
	error: Schema.Unknown
}) {}

export class AiMessagePartDelta extends Schema.TaggedClass<AiMessagePartDelta>()('AiMessagePartDelta', {
	partId: Schema.String,
	messageId: Schema.String,
	sessionId: Schema.String,
	delta: Schema.String
}) {}

// Permissions
export class AiToolPermissionRequest extends Schema.Class<AiToolPermissionRequest>('AiToolPermissionRequest')({
	id: Schema.String,
	sessionId: Schema.String,
	permission: Schema.String,
	patterns: Schema.Array(Schema.String),
	toolMessageId: Schema.optional(Schema.String),
	toolCallId: Schema.optional(Schema.String)
}) {}

export class AiToolPermissionReply extends Schema.Class<AiToolPermissionReply>('AiToolPermissionReply')({
	sessionId: Schema.String,
	requestId: Schema.String,
	reply: Schema.Literal('once', 'always', 'reject')
}) {}

export const AiOutputEvent = Schema.Union(
	AiStreamTextDelta,
	AiStreamReasoningDelta,
	AiStreamToolCall,
	AiStreamToolResult,
	AiStreamFinish,
	AiStreamError,
	AiMessagePartDelta,
	AiToolPermissionRequest,
	AiToolPermissionReply
)
