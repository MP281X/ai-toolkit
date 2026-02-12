import {Chunk, Effect, Option, Predicate, pipe, Schema, Stream} from 'effect'

import type {TextStreamPart as AiTextStreamPart, ToolSet} from 'ai'

export type ProviderId = typeof ProviderId.Type
export const ProviderId = Schema.Literal('opencode_zen', 'openrouter')

export type ModelId = typeof ModelId.Type
export const ModelId = Schema.Literal(
	'gpt-5-nano',
	'nvidia/nemotron-3-nano-30b-a3b:free',
	'arcee-ai/trinity-mini:free',
	'google/gemma-3n-e4b-it:free'
)

export type Model = typeof Model.Type
export const Model = Schema.transform(
	Schema.TemplateLiteral(ProviderId, Schema.Literal(':'), ModelId),
	Schema.Struct({provider: ProviderId, model: ModelId}),
	{
		decode: modelKey => {
			const separatorIndex = modelKey.indexOf(':')
			const provider = modelKey.slice(0, separatorIndex) as ProviderId
			const model = modelKey.slice(separatorIndex + 1) as ModelId
			return {provider, model}
		},
		encode: config => `${config.provider}:${config.model}` as const
	}
)

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.optional(Schema.Defect),
	message: Schema.optional(Schema.String)
}) {}

export class File extends Schema.TaggedClass<File>()('file', {
	base64: Schema.StringFromBase64,
	mediaType: Schema.String,
	name: Schema.optional(Schema.String)
}) {}

export class UserMessage extends Schema.Class<UserMessage>('UserMessage')({
	prompt: Schema.String,
	model: Model,
	attachments: Schema.Array(File)
}) {}

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
	error: Schema.Defect
}) {}

export class Start extends Schema.TaggedClass<Start>()('start', {
	model: Model,
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
export const ContentPart = Schema.Union(TextDelta, ReasoningDelta, ToolCall, ToolResult, ToolError, File, Error)

export type StreamPart = typeof StreamPart.Type
export const StreamPart = Schema.Union(
	Start,
	TextDelta,
	ReasoningDelta,
	ToolCall,
	ToolResult,
	ToolError,
	File,
	Finish,
	Error
)

export class Message extends Schema.Class<Message>('Message')({
	model: Model,
	startedAt: Schema.Number,
	role: Schema.Literal('user', 'assistant', 'system'),
	parts: Schema.Array(ContentPart),
	finishReason: Schema.optional(Finish.fields.finishReason),
	usage: Schema.optional(Finish.fields.usage)
}) {}

export const fromAiStreamPart = <T extends ToolSet>(part: AiTextStreamPart<T>) => {
	switch (part.type) {
		case 'text-delta':
			return TextDelta.make(part)
		case 'reasoning-delta':
			return ReasoningDelta.make(part)
		case 'file':
			return File.make({base64: part.file.base64, mediaType: part.file.mediaType})
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
			return
	}
}

function appendPart(parts: readonly ContentPart[], part: ContentPart) {
	const lastPart = parts[parts.length - 1]

	if (part._tag === 'text-delta' && lastPart?._tag === 'text-delta' && lastPart.id === part.id) {
		return [...parts.slice(0, -1), TextDelta.make({id: part.id, text: lastPart.text + part.text}, true)]
	}

	if (part._tag === 'reasoning-delta' && lastPart?._tag === 'reasoning-delta' && lastPart.id === part.id) {
		return [...parts.slice(0, -1), ReasoningDelta.make({id: part.id, text: lastPart.text + part.text}, true)]
	}

	return [...parts, part]
}

function updateMessage(current: Message | undefined, part: StreamPart) {
	switch (part._tag) {
		case 'start':
			return Message.make({model: part.model, startedAt: part.startedAt, role: part.role, parts: []}, true)
		case 'finish':
			if (Predicate.isNotNullable(current))
				return Message.make({...current, finishReason: part.finishReason, usage: part.usage}, true)
			return current
		default:
			if (Predicate.isNotNullable(current))
				return Message.make({...current, parts: appendPart(current.parts, part)}, true)
			return current
	}
}

export function streamToMessage<E>(stream: Stream.Stream<StreamPart, E>) {
	return Stream.filterMap(
		pipe(stream, Stream.scan(undefined as Message | undefined, updateMessage)),
		Option.fromNullable
	)
}

export function chunkToMessage(parts: Chunk.Chunk<StreamPart>) {
	const message = pipe(parts, Chunk.reduce(undefined as Message | undefined, updateMessage))
	if (Predicate.isNotUndefined(message)) return Effect.succeed(message)
	return AiSdkError.make({message: 'Invalid stream'})
}
