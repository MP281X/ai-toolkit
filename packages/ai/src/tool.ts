import {Schema} from 'effect'

export type ToolName = typeof ToolName.Type
export const ToolName = Schema.Literals(['question', 'websearch'])

export class QuestionTool extends Schema.Class<QuestionTool>('QuestionTool')({
	tool: Schema.tag('question'),
	input: Schema.Struct({
		questions: Schema.NonEmptyArray(
			Schema.Struct({
				question: Schema.NonEmptyString,
				header: Schema.optional(Schema.NonEmptyString),
				options: Schema.Array(
					Schema.Struct({
						label: Schema.NonEmptyString,
						description: Schema.optional(Schema.NonEmptyString)
					})
				),
				multiple: Schema.optional(Schema.Boolean),
				custom: Schema.optional(Schema.Boolean)
			})
		)
	}),
	output: Schema.Struct({
		answers: Schema.NonEmptyArray(Schema.Array(Schema.NonEmptyString))
	})
}) {}

export class WebsearchToolSource extends Schema.Class<WebsearchToolSource>('WebsearchToolSource')({
	title: Schema.optional(Schema.NonEmptyString),
	url: Schema.NonEmptyString,
	publishedDate: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String)
}) {}

export class WebsearchTool extends Schema.Class<WebsearchTool>('WebsearchTool')({
	tool: Schema.tag('websearch'),
	input: Schema.Struct({
		query: Schema.NonEmptyString
	}),
	output: Schema.Struct({
		query: Schema.NonEmptyString,
		sources: Schema.NonEmptyArray(WebsearchToolSource)
	})
}) {}
