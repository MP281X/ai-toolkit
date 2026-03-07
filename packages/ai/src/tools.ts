import {Array, Predicate, Schema} from 'effect'

export const ToolKind = Schema.Literals(['bash', 'glob', 'grep', 'other', 'patch', 'question', 'read', 'web', 'write'])
export type ToolKind = typeof ToolKind.Type

export function getToolKindLabel(toolKind: ToolKind) {
	return toolKind === 'other' ? 'tool' : toolKind
}

export const ToolOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.NonEmptyString)
})
export type ToolOption = typeof ToolOption.Type

export function makeToolOption(input: {label: string; description?: string}): ToolOption {
	const result: Record<string, unknown> = {label: input.label}
	if (input.description !== undefined) result['description'] = input.description
	return result as ToolOption
}

export const ToolQuestion = Schema.Struct({
	header: Schema.optional(Schema.NonEmptyString),
	question: Schema.NonEmptyString,
	allowFreeform: Schema.optional(Schema.Boolean),
	options: Schema.optional(Schema.Array(ToolOption)),
	multiple: Schema.optional(Schema.Boolean)
})
export type ToolQuestion = typeof ToolQuestion.Type

export function makeToolQuestion(input: {
	header?: string
	question: string
	allowFreeform?: boolean
	options?: readonly ToolOption[]
	multiple?: boolean
}): ToolQuestion {
	const result: Record<string, unknown> = {question: input.question}
	if (input.header !== undefined) result['header'] = input.header
	if (input.allowFreeform !== undefined) result['allowFreeform'] = input.allowFreeform
	if (input.options !== undefined) result['options'] = [...input.options]
	if (input.multiple !== undefined) result['multiple'] = input.multiple
	return result as ToolQuestion
}

export const QuestionToolInput = Schema.Struct({
	questions: Schema.Array(ToolQuestion)
})
export type QuestionToolInput = typeof QuestionToolInput.Type

export function makeQuestionToolInput(input: {questions: readonly ToolQuestion[]}): QuestionToolInput {
	return {questions: [...input.questions]}
}

const QuestionToolInvocationBoolean = Schema.Union([Schema.Boolean, Schema.String])

const QuestionToolInvocationOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.String)
})

export const QuestionToolInvocationInput = Schema.Struct({
	allowFreeform: Schema.optional(QuestionToolInvocationBoolean),
	choices: Schema.optional(Schema.Array(Schema.Union([Schema.NonEmptyString, QuestionToolInvocationOption]))),
	header: Schema.optional(Schema.String),
	multiple: Schema.optional(QuestionToolInvocationBoolean),
	options: Schema.optional(Schema.Array(QuestionToolInvocationOption)),
	question: Schema.optional(Schema.String),
	questions: Schema.optional(
		Schema.Union([
			Schema.Array(
				Schema.Union([
					Schema.String,
					Schema.Struct({
						allowFreeform: Schema.optional(QuestionToolInvocationBoolean),
						choices: Schema.optional(Schema.Array(Schema.Union([Schema.NonEmptyString, QuestionToolInvocationOption]))),
						header: Schema.optional(Schema.String),
						multiple: Schema.optional(QuestionToolInvocationBoolean),
						options: Schema.optional(Schema.Array(QuestionToolInvocationOption)),
						question: Schema.optional(Schema.String)
					})
				])
			),
			Schema.String
		])
	)
})
export type QuestionToolInvocationInput = typeof QuestionToolInvocationInput.Type

export const QuestionToolAnswer = Schema.Struct({
	answer: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
	wasFreeform: Schema.Boolean
})
export type QuestionToolAnswer = typeof QuestionToolAnswer.Type

export function makeQuestionToolAnswer(input: {
	answer: string | readonly string[]
	wasFreeform: boolean
}): QuestionToolAnswer {
	return {
		answer: Array.isArray(input.answer) ? [...input.answer] : input.answer,
		wasFreeform: input.wasFreeform
	}
}

export const QuestionToolOutput = Schema.Struct({
	answers: Schema.Array(QuestionToolAnswer)
})
export type QuestionToolOutput = typeof QuestionToolOutput.Type

export function makeQuestionToolOutput(input: {answers: readonly QuestionToolAnswer[]}): QuestionToolOutput {
	return {answers: [...input.answers]}
}

export const WebToolInput = Schema.Struct({
	query: Schema.optional(Schema.NonEmptyString),
	url: Schema.optional(Schema.NonEmptyString)
})
export type WebToolInput = typeof WebToolInput.Type

export function makeWebToolInput(input: {query?: string; url?: string}): WebToolInput {
	const result: Record<string, unknown> = {}
	if (input.query !== undefined) result['query'] = input.query
	if (input.url !== undefined) result['url'] = input.url
	return result as WebToolInput
}

export const WebToolSource = Schema.Struct({
	title: Schema.optional(Schema.NonEmptyString),
	url: Schema.NonEmptyString,
	publishedDate: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String)
})
export type WebToolSource = typeof WebToolSource.Type

export function makeWebToolSource(input: {
	title?: string
	url: string
	publishedDate?: string
	text?: string
}): WebToolSource {
	const result: Record<string, unknown> = {url: input.url}
	if (input.title !== undefined) result['title'] = input.title
	if (input.publishedDate !== undefined) result['publishedDate'] = input.publishedDate
	if (input.text !== undefined) result['text'] = input.text
	return result as WebToolSource
}

export const WebToolOutput = Schema.Struct({
	provider: Schema.optional(Schema.NonEmptyString),
	query: Schema.optional(Schema.NonEmptyString),
	url: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String),
	sources: Schema.Array(WebToolSource)
})
export type WebToolOutput = typeof WebToolOutput.Type

export function makeWebToolOutput(input?: {
	provider?: string
	query?: string
	url?: string
	text?: string
	sources?: readonly WebToolSource[]
}): WebToolOutput {
	const result: Record<string, unknown> = {sources: input?.sources ? [...input.sources] : []}
	if (input?.provider !== undefined) result['provider'] = input.provider
	if (input?.query !== undefined) result['query'] = input.query
	if (input?.url !== undefined) result['url'] = input.url
	if (input?.text !== undefined) result['text'] = input.text
	return result as WebToolOutput
}

export const CommandToolInput = Schema.Struct({
	command: Schema.NonEmptyString
})
export type CommandToolInput = typeof CommandToolInput.Type

export function makeCommandToolInput(command: string): CommandToolInput {
	return {command}
}

export const PathToolInput = Schema.Struct({
	path: Schema.NonEmptyString
})
export type PathToolInput = typeof PathToolInput.Type

export function makePathToolInput(path: string): PathToolInput {
	return {path}
}

export const PatternToolInput = Schema.Struct({
	pattern: Schema.NonEmptyString
})
export type PatternToolInput = typeof PatternToolInput.Type

export function makePatternToolInput(pattern: string): PatternToolInput {
	return {pattern}
}

export const TextToolOutput = Schema.Struct({
	text: Schema.String
})
export type TextToolOutput = typeof TextToolOutput.Type

export function makeTextToolOutput(text: string): TextToolOutput {
	return {text}
}

export function decodeToolValueOrUndefined<A>(schema: Schema.Schema<A>, value: unknown) {
	try {
		return Schema.decodeUnknownSync(schema as never)(value) as A
	} catch {
		return undefined
	}
}

export function decodeToolValueOrOriginal<A>(schema: Schema.Schema<A>, value: unknown) {
	return decodeToolValueOrUndefined(schema, value) ?? value
}

export function stringifyToolValue(value: unknown): string {
	if (Predicate.isString(value)) {
		return value
	}

	if (Predicate.isNumber(value) || Predicate.isBoolean(value)) {
		return `${value}`
	}

	if (Array.isArray(value)) {
		return value.map(item => stringifyToolValue(item)).join('\n')
	}

	if (Predicate.isNullish(value)) {
		return ''
	}

	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return `${value}`
	}
}
