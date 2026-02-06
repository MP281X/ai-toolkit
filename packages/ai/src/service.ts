import {Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {type ModelKey, resolveLanguageModel} from './models.ts'
import {fromAiStreamPart, Start, type StreamPart} from './schema.ts'
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
			stream: Effect.fnUntraced(function* (input: {prompt: string; model: ModelKey; group?: string}) {
				const isGroupId = (value: string): value is keyof typeof registry.groups => value in registry.groups

				const groupId = input.group ?? defaultGroupId
				if (!isGroupId(groupId)) return yield* new AiSdkError({cause: new Error(`Unknown tool group: ${groupId}`)})
				const group = registry.groups[groupId]

				const modelKey = input.model
				const model = yield* resolveLanguageModel(modelKey).pipe(Effect.mapError(cause => new AiSdkError({cause})))
				const repairToolCall = makeRepairToolCall({repairModel: model})

				const agent = new ToolLoopAgent({
					model,
					instructions: group.instructions,
					tools: registry.tools,
					activeTools: group.activeTools,
					experimental_repairToolCall: repairToolCall
				})

				const streamResult = yield* Effect.tryPromise({
					try: () => agent.stream({prompt: input.prompt}),
					catch: cause => new AiSdkError({cause})
				})
				const fullStream = streamResult.fullStream
				const separatorIndex = modelKey.indexOf(':')
				const providerId = modelKey.slice(0, separatorIndex)
				const modelId = modelKey.slice(separatorIndex + 1)

				const startChunk = Start.make({
					providerId,
					modelId,
					startedAt: Date.now(),
					role: 'assistant'
				})

				const aiStream = Stream.filterMap(
					Stream.fromAsyncIterable(fullStream, cause => new AiSdkError({cause})),
					part => Option.fromNullable(fromAiStreamPart(part))
				)

				return Stream.concat(Stream.succeed<StreamPart>(startChunk), aiStream)
			}, Stream.fromEffect)
		}
	})
}) {}
