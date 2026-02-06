import {Effect, Option, pipe, Schema, Stream} from 'effect'

import {ToolLoopAgent} from 'ai'

import {Model, resolveLanguageModel} from './models.ts'
import {fromAiStreamPart, Start, type StreamPart} from './schema.ts'
import {webSearchToolSet} from './tools/web-search.ts'

export class AiSdkError extends Schema.TaggedError<AiSdkError>()('AiSdkError', {
	cause: Schema.Defect,
	message: Schema.optional(Schema.String)
}) {}

export class AiInput extends Schema.Class<AiInput>('AiStreamInput')({
	prompt: Schema.String,
	model: Model
}) {}

export class AiSdk extends Effect.Service<AiSdk>()('@effect-full-stack-template/ai/AiClient', {
	accessors: true,
	effect: Effect.gen(function* () {
		const tools = {
			...(yield* webSearchToolSet)
		}

		return {
			stream: Effect.fnUntraced(function* (input: AiInput) {
				const agent = new ToolLoopAgent({
					model: yield* pipe(
						resolveLanguageModel(input.model),
						Effect.mapError(cause => AiSdkError.make({cause}))
					),
					tools
				})

				const {fullStream} = yield* Effect.tryPromise({
					try: () => agent.stream({prompt: input.prompt}),
					catch: cause => AiSdkError.make({cause})
				})

				return Stream.concat(
					Stream.succeed<StreamPart>(Start.make({model: input.model, startedAt: Date.now(), role: 'assistant'})),
					Stream.filterMap(
						Stream.fromAsyncIterable(fullStream, cause => AiSdkError.make({cause})),
						part => Option.fromNullable(fromAiStreamPart(part))
					)
				)
			}, Stream.unwrap)
		}
	})
}) {}
