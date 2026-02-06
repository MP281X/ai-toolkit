import {Match, Option, Predicate, Schema, Stream} from 'effect'

import type {TextStreamPart as AiTextStreamPart, ToolSet} from 'ai'

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

export class Error extends Schema.TaggedClass<Error>()('error', {
	error: Schema.Unknown
}) {}

export class Start extends Schema.TaggedClass<Start>()('start', {
	providerId: Schema.String,
	modelId: Schema.String,
	startedAt: Schema.Number,
	role: Schema.Literal('user', 'assistant', 'system')
}) {}

export class Finish extends Schema.TaggedClass<Finish>()('finish', {
	finishReason: Schema.Literal('stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'),
	usage: Schema.Struct({
		input: Schema.Number,
		output: Schema.Number,
		reasoning: Schema.Number
	})
}) {}

export type ContentPart = typeof ContentPart.Type
export const ContentPart = Schema.Union(TextDelta, ReasoningDelta, ToolCall, ToolResult, ToolError, Error)

export type StreamPart = typeof StreamPart.Type
export const StreamPart = Schema.Union(Start, TextDelta, ReasoningDelta, ToolCall, ToolResult, ToolError, Finish, Error)

export class Message extends Schema.Class<Message>('Message')({
	providerId: Schema.String,
	modelId: Schema.String,
	startedAt: Schema.Number,
	role: Schema.Literal('user', 'assistant', 'system'),
	parts: Schema.Array(ContentPart),
	finishReason: Schema.optional(Finish.fields.finishReason),
	usage: Schema.optional(Finish.fields.usage)
}) {}

export const fromAiStreamPart = <T extends ToolSet>(part: AiTextStreamPart<T>): StreamPart | null => {
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
			return new Finish({
				finishReason: part.finishReason,
				usage: {
					input: part.totalUsage?.inputTokens ?? 0,
					output: part.totalUsage?.outputTokenDetails?.textTokens ?? 0,
					reasoning: part.totalUsage?.outputTokenDetails?.reasoningTokens ?? 0
				}
			})
		case 'error':
			return Error.make(part)
		default:
			return null
	}
}

const mergeParts = (currentParts: readonly ContentPart[], part: ContentPart): ContentPart[] => {
	if (part._tag !== 'text-delta' && part._tag !== 'reasoning-delta') return [...currentParts, part]

	const lastPart = currentParts.at(-1)

	if (!lastPart) return [...currentParts, part]

	if (lastPart._tag !== 'text-delta' && lastPart._tag !== 'reasoning-delta') return [...currentParts, part]

	if (lastPart._tag !== part._tag || lastPart.id !== part.id) return [...currentParts, part]

	return [...currentParts.slice(0, -1), {...lastPart, text: lastPart.text + part.text}]
}

export const streamToMessage = (stream: Stream.Stream<StreamPart>) =>
	Stream.filterMap(
		Stream.scan(stream, null as Message | null, (current, part) =>
			Match.value(part).pipe(
				Match.when({_tag: 'start' as const}, start =>
					Message.make({
						providerId: start.providerId,
						modelId: start.modelId,
						startedAt: start.startedAt,
						role: start.role,
						parts: [],
						finishReason: undefined,
						usage: undefined
					})
				),
				Match.when({_tag: 'finish' as const}, finish =>
					Predicate.isNullable(current)
						? null
						: Message.make({
								...current,
								finishReason: finish.finishReason,
								usage: finish.usage
							})
				),
				Match.when({_tag: 'text-delta' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.when({_tag: 'reasoning-delta' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.when({_tag: 'tool-call' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.when({_tag: 'tool-result' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.when({_tag: 'tool-error' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.when({_tag: 'error' as const}, content => {
					if (Predicate.isNullable(current)) return null

					return Message.make({...current, parts: mergeParts(current.parts, content)})
				}),
				Match.exhaustive
			)
		),
		message => Option.fromNullable(message)
	)
