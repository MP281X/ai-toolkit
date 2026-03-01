import {Effect, Schema} from 'effect'

import {type ToolSet, tool} from 'ai'

export const questionToolSet = Effect.succeed({
	question: tool({
		description: 'Ask the user a list of questions and collect responses.',
		inputSchema: Schema.toStandardSchemaV1(
			Schema.toStandardJSONSchemaV1(
				Schema.Struct({
					questions: Schema.NonEmptyArray(
						Schema.Struct({
							header: Schema.NonEmptyString,
							question: Schema.NonEmptyString,
							options: Schema.optional(
								Schema.NonEmptyArray(
									Schema.Struct({
										label: Schema.NonEmptyString,
										description: Schema.optional(Schema.NonEmptyString)
									})
								)
							),
							multiple: Schema.optional(Schema.Boolean)
						})
					)
				})
			)
		)
	})
} satisfies ToolSet)
