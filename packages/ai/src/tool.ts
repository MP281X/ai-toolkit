import {Schema} from 'effect'

import {type FlexibleSchema, jsonSchema} from 'ai'

export type ToolName = typeof ToolName.Type
export const ToolName = Schema.Literals(['question', 'websearch'])

const QuestionOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.NonEmptyString)
})

const QuestionEntry = Schema.Struct({
	question: Schema.NonEmptyString,
	header: Schema.optional(Schema.NonEmptyString),
	options: Schema.Array(QuestionOption),
	multiple: Schema.optional(Schema.Boolean),
	custom: Schema.optional(Schema.Boolean)
})

const WebsearchSource = Schema.Struct({
	title: Schema.optional(Schema.NonEmptyString),
	url: Schema.NonEmptyString,
	publishedDate: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String)
})

export class QuestionTool extends Schema.Class<QuestionTool>('QuestionTool')({
	tool: Schema.tag('question'),
	input: Schema.Struct({
		questions: Schema.NonEmptyArray(QuestionEntry)
	}),
	output: Schema.Struct({
		answers: Schema.NonEmptyArray(Schema.Array(Schema.NonEmptyString))
	})
}) {}

export class WebsearchTool extends Schema.Class<WebsearchTool>('WebsearchTool')({
	tool: Schema.tag('websearch'),
	input: Schema.Struct({
		query: Schema.NonEmptyString
	}),
	output: Schema.Struct({
		sources: Schema.NonEmptyArray(WebsearchSource)
	})
}) {}

export const effectSchema = <S extends Schema.Top>(schema: S): FlexibleSchema<S['Type']> =>
	jsonSchema<S['Type']>(Schema.toJsonSchemaDocument(schema).schema)
