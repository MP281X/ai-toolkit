import {Array, Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {defaultModelKey, type ModelKey, resolveLanguageModel} from './models.ts'
import {fromAiTextStreamPart, type TextStreamPart} from './schema.ts'
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

export const AccumulateTextStream = (stream: Stream.Stream<TextStreamPart, never, never>) =>
	Stream.scan(stream, Array.empty<TextStreamPart>(), (parts, part) => {
		if (part._tag !== 'text-delta' && part._tag !== 'reasoning-delta') return Array.append(parts, part)

		if (!Array.isNonEmptyArray(parts)) return Array.append(parts, part)

		const last = Array.lastNonEmpty(parts)

		if (last._tag !== 'text-delta' && last._tag !== 'reasoning-delta') return Array.append(parts, part)

		if (last._tag !== part._tag || last.id !== part.id) return Array.append(parts, part)

		return Array.append(Array.initNonEmpty(parts), {...last, text: last.text + part.text})
	})
