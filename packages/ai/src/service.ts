import {Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {defaultModelKey, type ModelKey, resolveLanguageModel} from './models.ts'
import {fromAiTextStreamPart, Message, type TextStreamPart} from './schema.ts'
import {createToolRegistry} from './tools/registry.ts'
import {makeRepairToolCall} from './tools/repair.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

export class AiSdk extends Effect.Service<AiSdk>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const registry = createToolRegistry()
		const defaultGroupId = 'web'

		return {
			stream: Effect.fnUntraced(
				function* (input: {prompt: string; model?: ModelKey; group?: string}) {
					const groupId = input.group ?? defaultGroupId
					const group = registry.groups[groupId as keyof typeof registry.groups]

					if (!group) {
						return yield* new AiSdkError({cause: new Error(`Unknown tool group: ${groupId}`)})
					}
					const modelKey = input.model ?? defaultModelKey
					const model = yield* resolveLanguageModel(modelKey).pipe(Effect.mapError(cause => new AiSdkError({cause})))
					const repairToolCall = makeRepairToolCall({repairModel: model})

					const agent = new ToolLoopAgent({
						model,
						instructions: group.instructions,
						tools: registry.tools,
						activeTools: group.activeTools,
						experimental_repairToolCall: repairToolCall
					})

					const {fullStream} = yield* Effect.tryPromise({
						try: () => agent.stream({prompt: input.prompt}),
						catch: cause => new AiSdkError({cause})
					})

					return fullStream
				},
				Stream.fromEffect,
				Stream.flatMap(stream => Stream.fromAsyncIterable(stream, cause => new AiSdkError({cause}))),
				Stream.filterMap(part => Option.fromNullable(fromAiTextStreamPart(part)))
			)
		}
	})
}) {}

type TextStreamToMessagesOptions = {
	providerId: string
	modelId: string
	role?: Message['role']
}

const mergeParts = (currentParts: readonly TextStreamPart[], part: TextStreamPart): TextStreamPart[] => {
	if (part._tag === 'finish') return [...currentParts]

	if (part._tag !== 'text-delta' && part._tag !== 'reasoning-delta') return [...currentParts, part]

	const lastPart = currentParts.at(-1)

	if (!lastPart) return [...currentParts, part]

	if (lastPart._tag !== 'text-delta' && lastPart._tag !== 'reasoning-delta') return [...currentParts, part]

	if (lastPart._tag !== part._tag || lastPart.id !== part.id) return [...currentParts, part]

	return [...currentParts.slice(0, -1), {...lastPart, text: lastPart.text + part.text}]
}

export const TextStreamToMessages = (
	stream: Stream.Stream<TextStreamPart, never, never>,
	options: TextStreamToMessagesOptions
) =>
	Stream.scan(stream, [] as Message[], (messages, part) => {
		const lastMessage = messages.at(-1)
		const fallbackId = lastMessage ? lastMessage.id : `${options.providerId}:${options.modelId}`
		const messageId = 'id' in part ? part.id : fallbackId
		const messageIndex = messages.findIndex(message => message.id === messageId)
		const existingMessage = messageIndex === -1 ? null : messages[messageIndex]
		const baseMessage =
			existingMessage ??
			Message.make({
				id: messageId,
				providerId: options.providerId,
				modelId: options.modelId,
				role: options.role ?? 'assistant',
				parts: []
			})
		const nextMessage = Message.make({
			...baseMessage,
			parts: mergeParts(baseMessage.parts, part),
			finishReason: part._tag === 'finish' ? part.finishReason : baseMessage.finishReason,
			usage: part._tag === 'finish' ? part.usage : baseMessage.usage
		})

		if (messageIndex === -1) {
			return [...messages, nextMessage]
		}

		return messages.map((message, index) => (index === messageIndex ? nextMessage : message))
	})
