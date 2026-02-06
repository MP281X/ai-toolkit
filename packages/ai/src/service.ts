import {Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {defaultModelKey, type ModelKey, resolveLanguageModel} from './models.ts'
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
			stream: Effect.fnUntraced(function* (input: {prompt: string; model?: ModelKey; group?: string}) {
				const groupId = input.group ?? defaultGroupId
				const group = registry.groups[groupId as keyof typeof registry.groups]

				if (!group) return yield* new AiSdkError({cause: new Error(`Unknown tool group: ${groupId}`)})
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

				const startChunk = Start.make({
					providerId,
					modelId,
					startedAt: Date.now(),
					role: 'assistant'
				})

				return Stream.filterMap(
					Stream.concat(
						Stream.succeed(startChunk),
						Stream.fromAsyncIterable(fullStream, cause => new AiSdkError({cause}))
					),
					part => {
						if ('_tag' in part) return Option.some<StreamPart>(part)

						return Option.fromNullable(fromAiStreamPart(part))
					}
				)
			}, Stream.fromEffect)
		}
	})
}) {}
