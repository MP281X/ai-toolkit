import {Array, Match, Option, Predicate, Schema} from 'effect'

export const CanonicalToolKind = Schema.Literals(['question', 'web', 'bash', 'read', 'write', 'patch', 'glob', 'grep'])
export type CanonicalToolKind = typeof CanonicalToolKind.Type

export const ToolKind = Schema.String
export type ToolKind = typeof ToolKind.Type

export const QuestionOption = Schema.Struct({
	label: Schema.NonEmptyString,
	description: Schema.optional(Schema.NonEmptyString)
})
export type QuestionOption = typeof QuestionOption.Type

export const QuestionItem = Schema.Struct({
	question: Schema.NonEmptyString,
	header: Schema.optional(Schema.NullOr(Schema.NonEmptyString)),
	options: Schema.Array(QuestionOption).pipe(Schema.withConstructorDefault(() => Option.some([] as const))),
	multiple: Schema.optional(Schema.NullOr(Schema.Boolean)),
	custom: Schema.optional(Schema.NullOr(Schema.Boolean))
})
export type QuestionItem = typeof QuestionItem.Type

export const QuestionAnswer = Schema.Struct({
	answers: Schema.Array(Schema.String).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type QuestionAnswer = typeof QuestionAnswer.Type

export const QuestionToolInput = Schema.TaggedStruct('question', {
	questions: Schema.Array(QuestionItem).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type QuestionToolInput = typeof QuestionToolInput.Type

export const QuestionToolOutput = Schema.TaggedStruct('question', {
	answers: Schema.Array(QuestionAnswer).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type QuestionToolOutput = typeof QuestionToolOutput.Type

export const WebToolInput = Schema.TaggedStruct('web', {
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

export const WebToolOutput = Schema.TaggedStruct('web', {
	provider: Schema.optional(Schema.NonEmptyString),
	query: Schema.optional(Schema.NonEmptyString),
	url: Schema.optional(Schema.NonEmptyString),
	text: Schema.optional(Schema.String),
	sources: Schema.Array(WebToolSource).pipe(Schema.withConstructorDefault(() => Option.some([] as const)))
})
export type WebToolOutput = typeof WebToolOutput.Type

export const BashToolInput = Schema.TaggedStruct('bash', {
	command: Schema.NonEmptyString
})
export type BashToolInput = typeof BashToolInput.Type

export const ReadToolInput = Schema.TaggedStruct('read', {
	path: Schema.NonEmptyString
})
export type ReadToolInput = typeof ReadToolInput.Type

export const WriteToolInput = Schema.TaggedStruct('write', {
	path: Schema.NonEmptyString
})
export type WriteToolInput = typeof WriteToolInput.Type

export const PatchToolInput = Schema.TaggedStruct('patch', {
	path: Schema.optional(Schema.NonEmptyString),
	patch: Schema.optional(Schema.String)
})
export type PatchToolInput = typeof PatchToolInput.Type

export const GlobToolInput = Schema.TaggedStruct('glob', {
	pattern: Schema.NonEmptyString
})
export type GlobToolInput = typeof GlobToolInput.Type

export const GrepToolInput = Schema.TaggedStruct('grep', {
	pattern: Schema.NonEmptyString
})
export type GrepToolInput = typeof GrepToolInput.Type

export const ReportIntentToolInput = Schema.TaggedStruct('report_intent', {
	intent: Schema.NonEmptyString
})
export type ReportIntentToolInput = typeof ReportIntentToolInput.Type

export const TextToolOutput = Schema.TaggedStruct('text', {
	text: Schema.String
})
export type TextToolOutput = typeof TextToolOutput.Type

export const PatchToolOutput = Schema.TaggedStruct('patch', {
	path: Schema.optional(Schema.NonEmptyString),
	patch: Schema.String
})
export type PatchToolOutput = typeof PatchToolOutput.Type

export const NormalizedToolInput = Schema.Union([
	QuestionToolInput,
	WebToolInput,
	BashToolInput,
	ReadToolInput,
	WriteToolInput,
	PatchToolInput,
	GlobToolInput,
	GrepToolInput,
	ReportIntentToolInput
])
export type NormalizedToolInput = typeof NormalizedToolInput.Type

export const NormalizedToolOutput = Schema.Union([QuestionToolOutput, WebToolOutput, TextToolOutput, PatchToolOutput])
export type NormalizedToolOutput = typeof NormalizedToolOutput.Type

export function normalizeToolKind(toolName: string) {
	if (toolName.toLowerCase() === 'report_intent') {
		return 'report_intent' as const
	}

	return Match.value(toolName.toLowerCase()).pipe(
		Match.when('question', () => 'question' as const),
		Match.when('ask_user', () => 'question' as const),
		Match.when('web_search', () => 'web' as const),
		Match.when('web_fetch', () => 'web' as const),
		Match.when('webfetch', () => 'web' as const),
		Match.when('search', () => 'web' as const),
		Match.when('fetch', () => 'web' as const),
		Match.when('url', () => 'web' as const),
		Match.when('bash', () => 'bash' as const),
		Match.when('shell', () => 'bash' as const),
		Match.when('read', () => 'read' as const),
		Match.when('view', () => 'read' as const),
		Match.when('write', () => 'write' as const),
		Match.when('create_file', () => 'write' as const),
		Match.when('edit', () => 'write' as const),
		Match.when('patch', () => 'patch' as const),
		Match.when('str_replace_editor', () => 'patch' as const),
		Match.when('glob', () => 'glob' as const),
		Match.when('grep', () => 'grep' as const),
		Match.orElse(() => toolName)
	)
}

export function decodeToolValueOrUndefined<A>(schema: Schema.Schema<A>, value: unknown) {
	return Option.getOrUndefined(Schema.decodeUnknownOption(schema as never)(value)) as A | undefined
}

export function stringifyToolValue(value: unknown): string {
	if (Predicate.isString(value)) {
		return value
	}

	if (Predicate.isNumber(value) || Predicate.isBoolean(value)) {
		return globalThis.String(value)
	}

	if (Array.isArray(value)) {
		return value.map(entry => stringifyToolValue(entry)).join('\n')
	}

	if (Predicate.isNullish(value)) {
		return ''
	}

	if (Predicate.isObject(value)) {
		try {
			return JSON.stringify(value, null, 2)
		} catch {
			return '[object Object]'
		}
	}

	return globalThis.String(value)
}

export function normalizeToolInput(toolName: string, input: unknown) {
	if (normalizeToolKind(toolName) === 'question') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			if (Array.isArray(record['questions'])) {
				return QuestionToolInput.makeUnsafe({
					questions: record['questions'].flatMap(entry => {
						if (Predicate.isString(entry)) {
							const trimmed = entry.trim()
							return trimmed.length > 0 ? [QuestionItem.makeUnsafe({question: trimmed})] : []
						}

						if (Predicate.isObject(entry) && !Predicate.isNull(entry)) {
							const entryRecord = entry as Record<string, unknown>
							const question = Predicate.isString(entryRecord['question']) ? entryRecord['question'].trim() : ''
							return question.length === 0
								? []
								: [
										QuestionItem.makeUnsafe({
											custom: Predicate.isBoolean(entryRecord['custom']) ? entryRecord['custom'] : undefined,
											header:
												Predicate.isString(entryRecord['header']) && entryRecord['header'].trim().length > 0
													? entryRecord['header'].trim()
													: undefined,
											multiple: Predicate.isBoolean(entryRecord['multiple']) ? entryRecord['multiple'] : undefined,
											options: Array.isArray(entryRecord['options'])
												? entryRecord['options'].flatMap(option => {
														if (Predicate.isString(option)) {
															const trimmedOption = option.trim()
															return trimmedOption.length > 0 ? [QuestionOption.makeUnsafe({label: trimmedOption})] : []
														}

														if (Predicate.isObject(option) && !Predicate.isNull(option)) {
															const optionRecord = option as Record<string, unknown>
															const label = Predicate.isString(optionRecord['label'])
																? optionRecord['label'].trim()
																: ''
															return label.length === 0
																? []
																: [
																		QuestionOption.makeUnsafe({
																			description:
																				Predicate.isString(optionRecord['description']) &&
																				optionRecord['description'].trim().length > 0
																					? optionRecord['description'].trim()
																					: undefined,
																			label
																		})
																	]
														}

														return []
													})
												: [],
											question
										})
									]
						}

						return []
					})
				})
			}

			if (Predicate.isString(record['question']) && record['question'].trim().length > 0) {
				return QuestionToolInput.makeUnsafe({
					questions: [
						QuestionItem.makeUnsafe({
							custom: Predicate.isBoolean(record['custom']) ? record['custom'] : undefined,
							header:
								Predicate.isString(record['header']) && record['header'].trim().length > 0
									? record['header'].trim()
									: undefined,
							multiple: Predicate.isBoolean(record['multiple']) ? record['multiple'] : undefined,
							options: Array.isArray(record['options'])
								? record['options'].flatMap(option => {
										if (Predicate.isString(option)) {
											const trimmedOption = option.trim()
											return trimmedOption.length > 0 ? [QuestionOption.makeUnsafe({label: trimmedOption})] : []
										}

										if (Predicate.isObject(option) && !Predicate.isNull(option)) {
											const optionRecord = option as Record<string, unknown>
											const label = Predicate.isString(optionRecord['label']) ? optionRecord['label'].trim() : ''
											return label.length === 0
												? []
												: [
														QuestionOption.makeUnsafe({
															description:
																Predicate.isString(optionRecord['description']) &&
																optionRecord['description'].trim().length > 0
																	? optionRecord['description'].trim()
																	: undefined,
															label
														})
													]
										}

										return []
									})
								: [],
							question: record['question'].trim()
						})
					]
				})
			}
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'web') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const query =
				Predicate.isString(record['query']) && record['query'].trim().length > 0 ? record['query'].trim() : undefined
			const url =
				Predicate.isString(record['url']) && record['url'].trim().length > 0 ? record['url'].trim() : undefined
			const searchTerm =
				Predicate.isString(record['searchTerm']) && record['searchTerm'].trim().length > 0
					? record['searchTerm'].trim()
					: undefined
			const uri =
				Predicate.isString(record['uri']) && record['uri'].trim().length > 0 ? record['uri'].trim() : undefined
			return WebToolInput.makeUnsafe({query: query ?? searchTerm, url: url ?? uri})
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return WebToolInput.makeUnsafe({query: input.trim()})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'bash') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const command =
				Predicate.isString(record['command']) && record['command'].trim().length > 0
					? record['command'].trim()
					: undefined
			const fullCommandText =
				Predicate.isString(record['fullCommandText']) && record['fullCommandText'].trim().length > 0
					? record['fullCommandText'].trim()
					: undefined
			const bashCommand =
				Predicate.isString(record['bashCommand']) && record['bashCommand'].trim().length > 0
					? record['bashCommand'].trim()
					: undefined
			return (command ?? fullCommandText ?? bashCommand)
				? BashToolInput.makeUnsafe({command: command ?? fullCommandText ?? bashCommand ?? ''})
				: undefined
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return BashToolInput.makeUnsafe({command: input.trim()})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'read') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const path =
				Predicate.isString(record['path']) && record['path'].trim().length > 0 ? record['path'].trim() : undefined
			const filePath =
				Predicate.isString(record['filePath']) && record['filePath'].trim().length > 0
					? record['filePath'].trim()
					: undefined
			return (path ?? filePath) ? ReadToolInput.makeUnsafe({path: path ?? filePath ?? ''}) : undefined
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return ReadToolInput.makeUnsafe({path: input.trim()})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'write') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const path =
				Predicate.isString(record['path']) && record['path'].trim().length > 0 ? record['path'].trim() : undefined
			const filePath =
				Predicate.isString(record['filePath']) && record['filePath'].trim().length > 0
					? record['filePath'].trim()
					: undefined
			return (path ?? filePath) ? WriteToolInput.makeUnsafe({path: path ?? filePath ?? ''}) : undefined
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return WriteToolInput.makeUnsafe({path: input.trim()})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'patch') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			return PatchToolInput.makeUnsafe({
				path:
					Predicate.isString(record['path']) && record['path'].trim().length > 0 ? record['path'].trim() : undefined,
				patch: Predicate.isString(record['patch']) ? record['patch'] : undefined
			})
		}

		if (Predicate.isString(input)) {
			return PatchToolInput.makeUnsafe({patch: input})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'glob') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const pattern =
				Predicate.isString(record['pattern']) && record['pattern'].trim().length > 0
					? record['pattern'].trim()
					: undefined
			return pattern ? GlobToolInput.makeUnsafe({pattern}) : undefined
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return GlobToolInput.makeUnsafe({pattern: input.trim()})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'grep') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			const pattern =
				Predicate.isString(record['pattern']) && record['pattern'].trim().length > 0
					? record['pattern'].trim()
					: undefined
			const query =
				Predicate.isString(record['query']) && record['query'].trim().length > 0 ? record['query'].trim() : undefined
			return (pattern ?? query) ? GrepToolInput.makeUnsafe({pattern: pattern ?? query ?? ''}) : undefined
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return GrepToolInput.makeUnsafe({pattern: input.trim()})
		}

		return undefined
	}

	if (toolName.toLowerCase() === 'report_intent') {
		if (Predicate.isObject(input) && !Predicate.isNull(input)) {
			const record = input as Record<string, unknown>
			if (Predicate.isString(record['intent']) && record['intent'].trim().length > 0) {
				return ReportIntentToolInput.makeUnsafe({intent: record['intent'].trim()})
			}
		}

		if (Predicate.isString(input) && input.trim().length > 0) {
			return ReportIntentToolInput.makeUnsafe({intent: input.trim()})
		}

		return undefined
	}

	return undefined
}

export function normalizeToolOutput(toolName: string, output: unknown, input?: unknown) {
	if (normalizeToolKind(toolName) === 'question') {
		if (Predicate.isObject(output) && !Predicate.isNull(output)) {
			const record = output as Record<string, unknown>
			if (Array.isArray(record['answers'])) {
				return QuestionToolOutput.makeUnsafe({
					answers: record['answers'].flatMap(answer => {
						if (Predicate.isString(answer)) {
							return [QuestionAnswer.makeUnsafe({answers: [answer]})]
						}

						if (Array.isArray(answer)) {
							return [
								QuestionAnswer.makeUnsafe({
									answers: answer.flatMap(entry => (Predicate.isString(entry) ? [entry] : []))
								})
							]
						}

						if (Predicate.isObject(answer) && !Predicate.isNull(answer)) {
							const answerRecord = answer as Record<string, unknown>
							if (Array.isArray(answerRecord['answers'])) {
								return [
									QuestionAnswer.makeUnsafe({
										answers: answerRecord['answers'].flatMap(entry => (Predicate.isString(entry) ? [entry] : []))
									})
								]
							}

							if (Predicate.isString(answerRecord['answer'])) {
								return [QuestionAnswer.makeUnsafe({answers: [answerRecord['answer']]})]
							}

							if (Array.isArray(answerRecord['answer'])) {
								return [
									QuestionAnswer.makeUnsafe({
										answers: answerRecord['answer'].flatMap(entry => (Predicate.isString(entry) ? [entry] : []))
									})
								]
							}
						}

						return []
					})
				})
			}
		}

		if (Predicate.isString(output)) {
			return QuestionToolOutput.makeUnsafe({answers: [QuestionAnswer.makeUnsafe({answers: [output]})]})
		}

		if (Array.isArray(output)) {
			return QuestionToolOutput.makeUnsafe({
				answers: output.map(answer =>
					QuestionAnswer.makeUnsafe({
						answers: Array.isArray(answer) ? answer.flatMap(entry => (Predicate.isString(entry) ? [entry] : [])) : []
					})
				)
			})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'web') {
		if (Predicate.isObject(output) && !Predicate.isNull(output)) {
			const record = output as Record<string, unknown>
			const normalizedInput = normalizeToolInput(toolName, input)
			const fallbackQuery = normalizedInput?._tag === 'web' ? normalizedInput.query : undefined
			const fallbackUrl = normalizedInput?._tag === 'web' ? normalizedInput.url : undefined
			const query =
				Predicate.isString(record['query']) && record['query'].trim().length > 0 ? record['query'].trim() : undefined
			const url =
				Predicate.isString(record['url']) && record['url'].trim().length > 0 ? record['url'].trim() : undefined
			return WebToolOutput.makeUnsafe({
				provider:
					Predicate.isString(record['provider']) && record['provider'].trim().length > 0
						? record['provider'].trim()
						: undefined,
				query: query ?? fallbackQuery,
				url: url ?? fallbackUrl,
				text: Predicate.isString(record['text']) ? record['text'] : undefined,
				sources: Array.isArray(record['sources'])
					? record['sources'].flatMap(source => {
							if (Predicate.isObject(source) && !Predicate.isNull(source)) {
								const sourceRecord = source as Record<string, unknown>
								const url = Predicate.isString(sourceRecord['url']) ? sourceRecord['url'].trim() : ''
								return url.length === 0
									? []
									: [
											WebToolSource.makeUnsafe({
												publishedDate:
													Predicate.isString(sourceRecord['publishedDate']) &&
													sourceRecord['publishedDate'].trim().length > 0
														? sourceRecord['publishedDate'].trim()
														: undefined,
												text: Predicate.isString(sourceRecord['text']) ? sourceRecord['text'] : undefined,
												title:
													Predicate.isString(sourceRecord['title']) && sourceRecord['title'].trim().length > 0
														? sourceRecord['title'].trim()
														: undefined,
												url
											})
										]
							}

							return []
						})
					: []
			})
		}

		if (Predicate.isString(output)) {
			const normalizedInput = normalizeToolInput(toolName, input)
			return WebToolOutput.makeUnsafe({
				query: normalizedInput?._tag === 'web' ? normalizedInput.query : undefined,
				text: output,
				url: normalizedInput?._tag === 'web' ? normalizedInput.url : undefined
			})
		}

		return undefined
	}

	if (normalizeToolKind(toolName) === 'patch') {
		const normalizedInput = normalizeToolInput(toolName, input)
		const fallbackPath = normalizedInput?._tag === 'patch' ? normalizedInput.path : undefined
		if (Predicate.isString(output)) {
			return PatchToolOutput.makeUnsafe({
				path: fallbackPath,
				patch: output
			})
		}

		if (Predicate.isObject(output) && !Predicate.isNull(output)) {
			const record = output as Record<string, unknown>
			const patch = Predicate.isString(record['patch']) ? record['patch'] : stringifyToolValue(output)
			const path =
				Predicate.isString(record['path']) && record['path'].trim().length > 0 ? record['path'].trim() : undefined
			return PatchToolOutput.makeUnsafe({
				path: path ?? fallbackPath,
				patch
			})
		}

		return PatchToolOutput.makeUnsafe({
			path: fallbackPath,
			patch: stringifyToolValue(output)
		})
	}

	if (normalizeToolKind(toolName) === 'bash') {
		return TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})
	}

	if (normalizeToolKind(toolName) === 'read') {
		return TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})
	}

	if (normalizeToolKind(toolName) === 'write') {
		return TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})
	}

	if (normalizeToolKind(toolName) === 'glob') {
		return TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})
	}

	if (normalizeToolKind(toolName) === 'grep') {
		return TextToolOutput.makeUnsafe({text: stringifyToolValue(output)})
	}

	return undefined
}
