import {Effect, Option, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {ModelKeySchema, parseModelKey, resolveLanguageModel} from './models.ts'
import {fromAiStreamPart, Start, type StreamPart} from './schema.ts'
import {createToolRegistry} from './tools/registry.ts'
import {makeRepairToolCall} from './tools/repair.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

export const GroupIdSchema = Schema.Literal('default', 'web', 'extreme')
export const AiStreamInputSchema = Schema.Struct({
	prompt: Schema.String,
	model: ModelKeySchema,
	group: GroupIdSchema
})
export type AiStreamInput = typeof AiStreamInputSchema.Type

export class AiSdk extends Effect.Service<AiSdk>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const registry = createToolRegistry()

		return {
			stream: Effect.fnUntraced(function* (input: AiStreamInput) {
				const group = registry.groups[input.group]

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
				const {providerId, modelId} = parseModelKey(modelKey)

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
