import {randomUUID} from 'node:crypto'

import {Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {defaultModelKey, type ModelKey, resolveLanguageModel} from './models.ts'
import {fromAiTextStreamPart, Message, Start, type TextStreamPart} from './schema.ts'
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

					const [providerId, modelId] = (modelKey.includes(':') ? modelKey : defaultModelKey).split(':') as [
						string,
						string
					]

					const startPart = Start.make({
						id: randomUUID(),
						providerId,
						modelId,
						startedAt: Date.now(),
						role: 'assistant'
					})

					return {startPart, fullStream}
				},
				Stream.fromEffect,
				Stream.flatMap(({startPart, fullStream}) =>
					Stream.filterMap(
						Stream.concat(
							Stream.make(startPart),
							Stream.fromAsyncIterable(fullStream, cause => new AiSdkError({cause}))
						),
						part => {
							if ('_tag' in part) return Option.some<TextStreamPart>(part)

							return Option.fromNullable(fromAiTextStreamPart(part))
						}
					)
				)
			)
		}
	})
}) {}

type TextStreamToMessagesOptions = {
	providerId: string
	modelId: string
	role?: Message['role']
}

type ContentPart = Message['parts'][number]

const mergeParts = (currentParts: readonly ContentPart[], part: ContentPart): ContentPart[] => {
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
	Stream.map(
		Stream.filterMap(
			Stream.scan(stream, null as Message | null, (current, part) => {
				if (part._tag === 'start') {
					return Message.make({
						id: part.id,
						providerId: part.providerId,
						modelId: part.modelId,
						startedAt: part.startedAt,
						role: part.role,
						parts: [],
						finishReason: undefined,
						usage: undefined
					})
				}

				if (!current) {
					return Message.make({
						id: `${options.providerId}:${options.modelId}`,
						providerId: options.providerId,
						modelId: options.modelId,
						startedAt: Date.now(),
						role: options.role ?? 'assistant',
						parts: [],
						finishReason: undefined,
						usage: undefined
					})
				}

				if (part._tag === 'finish') {
					return Message.make({
						...current,
						finishReason: part.finishReason,
						usage: part.usage
					})
				}

				return Message.make({
					...current,
					parts: mergeParts(current.parts, part)
				})
			}),
			message => Option.fromNullable(message)
		),
		message => message
	)
