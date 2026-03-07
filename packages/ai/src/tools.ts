import {Array, Match, Option, Predicate, pipe, Schema, SchemaGetter} from 'effect'

// ──────────────────────────── Canonical Tool Names ────────────────────────────

export function normalizeToolName(toolName?: string) {
	const normalized = toolName?.toLowerCase()
	return pipe(
		Match.value(normalized),
		Match.when(Match.is('question', 'ask_user'), () => 'question' as const),
		Match.when(Match.is('web_search', 'web_fetch', 'webfetch', 'search', 'fetch', 'url'), () => 'web' as const),
		Match.when(Match.is('bash', 'shell'), () => 'bash' as const),
		Match.when(Match.is('read', 'view'), () => 'read' as const),
		Match.when(Match.is('write', 'create_file', 'edit'), () => 'write' as const),
		Match.when(Match.is('patch', 'str_replace_editor'), () => 'patch' as const),
		Match.when(Match.is('glob'), () => 'glob' as const),
		Match.when(Match.is('grep'), () => 'grep' as const),
		Match.orElse(() => (toolName ?? '') as string & {})
	)
}

// ──────────────────────────── Canonical Schemas ────────────────────────────

export const ToolOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.NonEmptyString)
})
export type ToolOption = typeof ToolOption.Type

export const ToolQuestion = Schema.Struct({
	header: Schema.optional(Schema.NonEmptyString),
	question: Schema.NonEmptyString,
	allowFreeform: Schema.optional(Schema.Boolean),
	options: Schema.optional(Schema.Array(ToolOption)),
	multiple: Schema.optional(Schema.Boolean)
})
export type ToolQuestion = typeof ToolQuestion.Type

export const QuestionToolInput = Schema.Struct({
	questions: Schema.Array(ToolQuestion).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type QuestionToolInput = typeof QuestionToolInput.Type

export const QuestionToolAnswer = Schema.Struct({
	answer: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
	wasFreeform: Schema.Boolean
})
export type QuestionToolAnswer = typeof QuestionToolAnswer.Type

export const QuestionToolOutput = Schema.Struct({
	answers: Schema.Array(QuestionToolAnswer).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type QuestionToolOutput = typeof QuestionToolOutput.Type

export const WebToolInput = Schema.Struct({
	query: Schema.optional(Schema.NonEmptyString),
	url: Schema.optional(Schema.NonEmptyString)
})
export type WebToolInput = typeof WebToolInput.Type

export const WebToolSource = Schema.Struct({
	title: Schema.optional(Schema.NonEmptyString),
	url: Schema.NonEmptyString,
	publishedDate: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String)
})
export type WebToolSource = typeof WebToolSource.Type

export const WebToolOutput = Schema.Struct({
	provider: Schema.optional(Schema.NonEmptyString),
	query: Schema.optional(Schema.NonEmptyString),
	url: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String),
	sources: Schema.Array(WebToolSource).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type WebToolOutput = typeof WebToolOutput.Type

export const CommandToolInput = Schema.Struct({
	command: Schema.NonEmptyString
})
export type CommandToolInput = typeof CommandToolInput.Type

export const PathToolInput = Schema.Struct({
	path: Schema.NonEmptyString
})
export type PathToolInput = typeof PathToolInput.Type

export const PatternToolInput = Schema.Struct({
	pattern: Schema.NonEmptyString
})
export type PatternToolInput = typeof PatternToolInput.Type

export const TextToolOutput = Schema.Struct({
	text: Schema.String
})
export type TextToolOutput = typeof TextToolOutput.Type

// ──────────────────────────── Unified Tool Data ────────────────────────────

export const QuestionToolData = Schema.TaggedStruct('question', {
	input: QuestionToolInput,
	output: Schema.optional(QuestionToolOutput)
})
export type QuestionToolData = typeof QuestionToolData.Type

export const WebToolData = Schema.TaggedStruct('web', {
	input: WebToolInput,
	output: Schema.optional(WebToolOutput)
})
export type WebToolData = typeof WebToolData.Type

export const BashToolData = Schema.TaggedStruct('bash', {
	input: CommandToolInput,
	output: Schema.optional(TextToolOutput)
})
export type BashToolData = typeof BashToolData.Type

export const ReadToolData = Schema.TaggedStruct('read', {
	input: PathToolInput,
	output: Schema.optional(TextToolOutput)
})
export type ReadToolData = typeof ReadToolData.Type

export const WriteToolData = Schema.TaggedStruct('write', {
	input: PathToolInput,
	output: Schema.optional(TextToolOutput)
})
export type WriteToolData = typeof WriteToolData.Type

export const PatchToolData = Schema.TaggedStruct('patch', {
	input: PathToolInput,
	output: Schema.optional(TextToolOutput)
})
export type PatchToolData = typeof PatchToolData.Type

export const GlobToolData = Schema.TaggedStruct('glob', {
	input: PatternToolInput,
	output: Schema.optional(TextToolOutput)
})
export type GlobToolData = typeof GlobToolData.Type

export const GrepToolData = Schema.TaggedStruct('grep', {
	input: PatternToolInput,
	output: Schema.optional(TextToolOutput)
})
export type GrepToolData = typeof GrepToolData.Type

export const ToolData = Schema.Union([
	QuestionToolData,
	WebToolData,
	BashToolData,
	ReadToolData,
	WriteToolData,
	PatchToolData,
	GlobToolData,
	GrepToolData
])
export type ToolData = typeof ToolData.Type

// ──────────────────────────── Wire → Canonical Transforms ────────────────────────────

const QuestionToolInvocationBoolean = Schema.Union([Schema.Boolean, Schema.String])

const QuestionToolInvocationOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.String)
})

const QuestionToolInvocationQuestion = Schema.Struct({
	allowFreeform: Schema.optional(QuestionToolInvocationBoolean),
	choices: Schema.optional(Schema.Array(Schema.Union([Schema.NonEmptyString, QuestionToolInvocationOption]))),
	header: Schema.optional(Schema.String),
	multiple: Schema.optional(QuestionToolInvocationBoolean),
	options: Schema.optional(Schema.Array(QuestionToolInvocationOption)),
	question: Schema.optional(Schema.String)
})

const QuestionToolInvocationWire = Schema.Struct({
	allowFreeform: Schema.optional(QuestionToolInvocationBoolean),
	choices: Schema.optional(Schema.Array(Schema.Union([Schema.NonEmptyString, QuestionToolInvocationOption]))),
	header: Schema.optional(Schema.String),
	multiple: Schema.optional(QuestionToolInvocationBoolean),
	options: Schema.optional(Schema.Array(QuestionToolInvocationOption)),
	question: Schema.optional(Schema.String),
	questions: Schema.optional(
		Schema.Union([Schema.Array(Schema.Union([Schema.String, QuestionToolInvocationQuestion])), Schema.String])
	)
})

const QuestionToolInvocationInput = QuestionToolInvocationWire.pipe(
	Schema.decodeTo(QuestionToolInput, {
		decode: SchemaGetter.transform(normalizeQuestionInvocationInput),
		encode: SchemaGetter.transform(value => value)
	})
)

const WebToolInvocationWire = Schema.Struct({
	query: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String),
	searchTerm: Schema.optional(Schema.String),
	uri: Schema.optional(Schema.String)
})

const WebToolInvocationInput = WebToolInvocationWire.pipe(
	Schema.decodeTo(WebToolInput, {
		decode: SchemaGetter.transform(wire =>
			WebToolInput.makeUnsafe({
				query: normalizeNonEmptyString(wire.query) ?? normalizeNonEmptyString(wire.searchTerm),
				url: normalizeNonEmptyString(wire.url) ?? normalizeNonEmptyString(wire.uri)
			})
		),
		encode: SchemaGetter.transform(value => value)
	})
)

const CommandToolInvocationWire = Schema.Struct({
	command: Schema.optional(Schema.String),
	fullCommandText: Schema.optional(Schema.String),
	bashCommand: Schema.optional(Schema.String)
})

const CommandToolInvocationInput = CommandToolInvocationWire.pipe(
	Schema.decodeTo(CommandToolInput, {
		decode: SchemaGetter.transform(wire => {
			const command =
				normalizeNonEmptyString(wire.command) ??
				normalizeNonEmptyString(wire.fullCommandText) ??
				normalizeNonEmptyString(wire.bashCommand)
			return CommandToolInput.makeUnsafe({command: command ?? ''})
		}),
		encode: SchemaGetter.transform(value => value)
	})
)

const PathToolInvocationWire = Schema.Struct({
	path: Schema.optional(Schema.String),
	filePath: Schema.optional(Schema.String)
})

const PathToolInvocationInput = PathToolInvocationWire.pipe(
	Schema.decodeTo(PathToolInput, {
		decode: SchemaGetter.transform(wire => {
			const path = normalizeNonEmptyString(wire.path) ?? normalizeNonEmptyString(wire.filePath)
			return PathToolInput.makeUnsafe({path: path ?? ''})
		}),
		encode: SchemaGetter.transform(value => value)
	})
)

const PatternToolInvocationWire = Schema.Struct({
	pattern: Schema.optional(Schema.String),
	query: Schema.optional(Schema.String)
})

const PatternToolInvocationInput = PatternToolInvocationWire.pipe(
	Schema.decodeTo(PatternToolInput, {
		decode: SchemaGetter.transform(wire => {
			const pattern = normalizeNonEmptyString(wire.pattern) ?? normalizeNonEmptyString(wire.query)
			return PatternToolInput.makeUnsafe({pattern: pattern ?? ''})
		}),
		encode: SchemaGetter.transform(value => value)
	})
)

// ──────────────────────────── Public Utilities ────────────────────────────

export function decodeToolValueOrUndefined<A>(schema: Schema.Schema<A>, value: unknown) {
	const decoded = Schema.decodeUnknownOption(schema as never)(value)
	return Option.getOrUndefined(decoded) as A | undefined
}

export function stringifyToolValue(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return `${value}`
	}

	if (Array.isArray(value)) {
		return value.map(item => stringifyToolValue(item)).join('\n')
	}

	if (value == null) {
		return ''
	}

	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return `${value}`
	}
}

// ──────────────────────────── Normalization ────────────────────────────

export function normalizeToolInput(toolName: string, input: unknown) {
	const canonical = normalizeToolName(toolName)
	return pipe(
		Match.value(canonical),
		Match.when('question', () => decodeToolValueOrUndefined(QuestionToolInvocationInput, input) ?? input),
		Match.when('web', () => decodeToolValueOrUndefined(WebToolInvocationInput, input) ?? input),
		Match.when('bash', () => decodeToolValueOrUndefined(CommandToolInvocationInput, input) ?? input),
		Match.when('read', () => decodeToolValueOrUndefined(PathToolInvocationInput, input) ?? input),
		Match.when('write', () => decodeToolValueOrUndefined(PathToolInvocationInput, input) ?? input),
		Match.when('patch', () => decodeToolValueOrUndefined(PathToolInvocationInput, input) ?? input),
		Match.when('glob', () => decodeToolValueOrUndefined(PatternToolInvocationInput, input) ?? input),
		Match.when('grep', () => decodeToolValueOrUndefined(PatternToolInvocationInput, input) ?? input),
		Match.orElse(() => input)
	)
}

export function normalizeToolOutput(toolName: string, output: unknown, input?: unknown) {
	const canonical = normalizeToolName(toolName)
	return pipe(
		Match.value(canonical),
		Match.when('question', () => normalizeQuestionOutput(output)),
		Match.when('web', () => normalizeWebOutput(output, input)),
		Match.when('bash', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.when('read', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.when('write', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.when('patch', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.when('glob', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.when('grep', () => TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})),
		Match.orElse(() => output)
	)
}

// ──────────────────────────── Internal Helpers ────────────────────────────

function normalizeQuestionOutput(output: unknown) {
	const decoded = decodeToolValueOrUndefined(QuestionToolOutput, output)
	if (decoded) {
		return decoded
	}

	const text = decodeToolValueOrUndefined(TextToolOutput, output)?.text
	if (text && text.length > 0) {
		return QuestionToolOutput.makeUnsafe({
			answers: [QuestionToolAnswer.makeUnsafe({answer: text, wasFreeform: true})]
		})
	}

	if (typeof output === 'string' && output.length > 0) {
		return QuestionToolOutput.makeUnsafe({
			answers: [QuestionToolAnswer.makeUnsafe({answer: output, wasFreeform: true})]
		})
	}

	return output
}

function normalizeWebOutput(output: unknown, input?: unknown) {
	const decoded = decodeToolValueOrUndefined(WebToolOutput, output)
	if (decoded) {
		return decoded
	}

	if (typeof output !== 'object' || output === null) {
		return output
	}

	const record = output as Record<string, unknown>
	const defaults = decodeToolValueOrUndefined(WebToolInvocationInput, input)
	const query = normalizeNonEmptyString(record['query']) ?? defaults?.query
	const url = normalizeNonEmptyString(record['url']) ?? defaults?.url
	const text = typeof record['text'] === 'string' ? record['text'] : undefined
	const sources = Array.isArray(record['sources']) ? record['sources'].flatMap(normalizeWebToolSource) : []

	if (!(query || url || text || sources.length > 0)) {
		return output
	}

	return WebToolOutput.makeUnsafe({
		provider: normalizeNonEmptyString(record['provider']),
		query,
		url,
		text,
		sources
	})
}

function normalizeQuestionInvocationInput(input: typeof QuestionToolInvocationWire.Type): QuestionToolInput {
	const questionsSource =
		typeof input.questions === 'string' ? parseQuestionWireQuestions(input.questions) : (input.questions ?? [])
	const questions = questionsSource.flatMap(entry => normalizeQuestionEntry(entry, input))
	if (questions.length > 0) {
		return QuestionToolInput.makeUnsafe({questions})
	}

	const question = normalizeNonEmptyString(input.question)
	if (!question) {
		return QuestionToolInput.makeUnsafe({})
	}

	return QuestionToolInput.makeUnsafe({
		questions: [
			ToolQuestion.makeUnsafe({
				allowFreeform: normalizeQuestionBoolean(input.allowFreeform),
				header: normalizeNonEmptyString(input.header),
				multiple: normalizeQuestionBoolean(input.multiple),
				options: normalizeQuestionOptions(input.options ?? input.choices),
				question
			})
		]
	})
}

function normalizeQuestionEntry(
	entry: unknown,
	defaults: typeof QuestionToolInvocationWire.Type
): readonly ToolQuestion[] {
	if (typeof entry === 'string') {
		const question = normalizeNonEmptyString(entry)
		return question
			? [
					ToolQuestion.makeUnsafe({
						allowFreeform: normalizeQuestionBoolean(defaults.allowFreeform),
						header: normalizeNonEmptyString(defaults.header),
						multiple: normalizeQuestionBoolean(defaults.multiple),
						options: normalizeQuestionOptions(defaults.options ?? defaults.choices),
						question
					})
				]
			: []
	}

	const question = normalizeNonEmptyString((entry as {question?: unknown}).question)
	if (!question) {
		return []
	}

	const record = entry as typeof QuestionToolInvocationQuestion.Type
	return [
		ToolQuestion.makeUnsafe({
			allowFreeform: normalizeQuestionBoolean(record.allowFreeform) ?? normalizeQuestionBoolean(defaults.allowFreeform),
			header: normalizeNonEmptyString(record.header) ?? normalizeNonEmptyString(defaults.header),
			multiple: normalizeQuestionBoolean(record.multiple) ?? normalizeQuestionBoolean(defaults.multiple),
			options:
				normalizeQuestionOptions(record.options ?? record.choices) ??
				normalizeQuestionOptions(defaults.options ?? defaults.choices),
			question
		})
	]
}

function normalizeQuestionBoolean(value: unknown) {
	if (typeof value === 'boolean') {
		return value
	}

	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.trim().toLowerCase()
	if (normalized === 'true') {
		return true
	}

	if (normalized === 'false') {
		return false
	}

	return undefined
}

function normalizeQuestionOptions(value: unknown) {
	if (!Array.isArray(value)) {
		return undefined
	}

	const options = value.flatMap(entry => {
		if (typeof entry === 'string') {
			const label = normalizeNonEmptyString(entry)
			return label ? [ToolOption.makeUnsafe({label})] : []
		}

		if (typeof entry !== 'object' || entry === null) {
			return []
		}

		const record = entry as Record<string, unknown>
		const label = normalizeNonEmptyString(record['label'])
		return label ? [ToolOption.makeUnsafe({description: normalizeNonEmptyString(record['description']), label})] : []
	})

	return options.length > 0 ? options : undefined
}

function parseQuestionWireQuestions(value: string): readonly unknown[] {
	const parsed = parseJsonOrUndefined(value) ?? parseJsonOrUndefined(value.replaceAll('/', ''))
	if (Array.isArray(parsed)) {
		return parsed
	}

	return Predicate.isNotUndefined(parsed) ? [parsed] : [value]
}

function normalizeWebToolSource(source: unknown): readonly WebToolSource[] {
	if (typeof source !== 'object' || source === null) {
		return []
	}

	const record = source as Record<string, unknown>
	const url = normalizeNonEmptyString(record['url'])
	return url
		? [
				WebToolSource.makeUnsafe({
					publishedDate: normalizeNonEmptyString(record['publishedDate']),
					text: typeof record['text'] === 'string' ? record['text'] : undefined,
					title: normalizeNonEmptyString(record['title']),
					url
				})
			]
		: []
}

function normalizeNonEmptyString(value: unknown) {
	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.trim()
	return normalized.length > 0 ? normalized : undefined
}

function parseJsonOrUndefined(value: string) {
	try {
		return JSON.parse(value) as unknown
	} catch {
		return undefined
	}
}
