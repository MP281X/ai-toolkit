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
export class AiStreamInput extends Schema.Class<AiStreamInput>('AiStreamInput')({
	prompt: Schema.String,
	model: ModelKeySchema,
	group: GroupIdSchema
}) {}
export type AiStreamInputType = typeof AiStreamInput.Type

export class AiSdk extends Effect.Service<AiSdk>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const registry = createToolRegistry()

		return {
			stream: Effect.fnUntraced(function* (input: AiStreamInputType) {
				const group = registry.groups[input.group]

				const model = yield* resolveLanguageModel(input.model).pipe(Effect.mapError(cause => new AiSdkError({cause})))
				const repairToolCall = makeRepairToolCall({repairModel: model})

				const agent = new ToolLoopAgent({
					model,
					instructions: group.instructions,
					tools: registry.tools,
					activeTools: group.activeTools,
					experimental_repairToolCall: repairToolCall
				})

				const aiStream = Stream.filterMap(
					Stream.fromAsyncIterable(
						(yield* Effect.tryPromise({
							try: () => agent.stream({prompt: input.prompt}),
							catch: cause => new AiSdkError({cause})
						})).fullStream,
						cause => new AiSdkError({cause})
					),
					part => Option.fromNullable(fromAiStreamPart(part))
				)

				return Stream.concat(
					Stream.succeed<StreamPart>(
						Start.make({
							...parseModelKey(input.model),
							startedAt: Date.now(),
							role: 'assistant'
						})
					),
					aiStream
				)
			}, Stream.fromEffect)
		}
	})
}) {}
