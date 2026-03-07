import {Effect, Schema} from 'effect'

import {type ToolSet, tool} from 'ai'

import {QuestionToolInvocationInput} from '../tools.ts'

export const questionToolSet = Effect.succeed({
	question: tool({
		description: 'Ask the user a list of questions and collect responses.',
		inputSchema: Schema.toStandardSchemaV1(Schema.toStandardJSONSchemaV1(QuestionToolInvocationInput))
	})
} satisfies ToolSet)
