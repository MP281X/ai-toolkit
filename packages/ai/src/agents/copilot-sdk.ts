import type {Scope} from 'effect'
import {Array, Deferred, Effect, flow, Layer, Match, Predicate, pipe, Queue, Ref, Stream, SubscriptionRef} from 'effect'

import {CopilotClient, type PermissionRequestResult, type SessionEvent} from '@github/copilot-sdk'

import type {ModelId, ModelSelection} from '../catalog.ts'
import {
	AiError,
	applyConversationPartStream,
	type ConversationMessage,
	type ConversationPart,
	createUserTurnParts,
	type MessageStreamPart,
	makeErrorPart,
	makeFinishPart,
	makeReasoningDeltaPart,
	makeStartPart,
	makeTextDeltaPart,
	makeToolApprovalRequestPart,
	makeToolCallPart,
	makeToolErrorPart,
	makeToolResultPart,
	type ToolMessagePart,
	type UserMessagePart
} from '../schema.ts'
import {Agent} from '../service.ts'
import {
	decodeToolValueOrUndefined,
	makeCommandToolInput,
	makePathToolInput,
	makePatternToolInput,
	makeQuestionToolAnswer,
	makeQuestionToolInput,
	makeQuestionToolOutput,
	makeTextToolOutput,
	makeToolOption,
	makeToolQuestion,
	makeWebToolInput,
	QuestionToolInput,
	QuestionToolOutput,
	stringifyToolValue,
	TextToolOutput,
	type ToolKind,
	WebToolOutput
} from '../tools.ts'

type QuestionAnswer = {answer: string; wasFreeform: boolean}

function makeUserInputQuestionToolInput(input: {
	allowFreeform?: boolean
	choices?: readonly string[]
	question: string
}) {
	return makeQuestionToolInput({
		questions: [
			makeToolQuestion({
				allowFreeform: input.allowFreeform,
				header: 'Question',
				options: (input.choices ?? []).map(choice => makeToolOption({label: choice})),
				question: input.question
			})
		]
	})
}

function getQuestionToolSignature(input: unknown) {
	const questionInput = decodeToolValueOrUndefined(QuestionToolInput, input)
	const question = questionInput?.questions[0]
	if (!question) {
		return undefined
	}

	return JSON.stringify({
		allowFreeform: question.allowFreeform,
		header: question.header,
		multiple: question.multiple,
		options: (question.options ?? []).map(option => [option.label, option.description]),
		question: question.question
	})
}

function enqueueQuestionToolCallId(questionToolCallIds: Map<string, string[]>, input: unknown, toolCallId: string) {
	const signature = getQuestionToolSignature(input)
	if (!signature) {
		return
	}

	questionToolCallIds.set(signature, [...(questionToolCallIds.get(signature) ?? []), toolCallId])
}

function takeQuestionToolCallId(questionToolCallIds: Map<string, string[]>, input: unknown) {
	const signature = getQuestionToolSignature(input)
	if (!signature) {
		return undefined
	}

	const [toolCallId, ...rest] = questionToolCallIds.get(signature) ?? []
	if (!toolCallId) {
		return undefined
	}

	if (rest.length === 0) {
		questionToolCallIds.delete(signature)
	} else {
		questionToolCallIds.set(signature, rest)
	}

	return toolCallId
}

function deleteQuestionToolCallId(questionToolCallIds: Map<string, string[]>, toolCallId: string) {
	for (const [signature, toolCallIds] of questionToolCallIds) {
		const nextToolCallIds = toolCallIds.filter(candidate => candidate !== toolCallId)
		if (nextToolCallIds.length === toolCallIds.length) {
			continue
		}

		if (nextToolCallIds.length === 0) {
			questionToolCallIds.delete(signature)
		} else {
			questionToolCallIds.set(signature, nextToolCallIds)
		}
		return
	}
}

function isCopilotIntentTool(toolName: string | undefined) {
	const normalizedToolName = toolName?.toLowerCase()
	return normalizedToolName === 'report_intent' || normalizedToolName === 'assistant.intent'
}

function extractCopilotIntent(input: unknown) {
	if (typeof input !== 'object' || input === null) {
		return undefined
	}

	const record = input as Record<string, unknown>
	const intent = record['intent']
	if (typeof intent === 'string' && intent.length > 0) {
		return intent
	}

	const text = record['text']
	return typeof text === 'string' && text.length > 0 ? text : undefined
}

function resolveCopilotToolKind(toolName: string | undefined): ToolKind {
	if (isCopilotIntentTool(toolName)) {
		return 'other'
	}

	const normalizedToolName = toolName?.toLowerCase()

	return Match.value(normalizedToolName).pipe(
		Match.when('question', () => 'question' as const),
		Match.when('ask_user', () => 'question' as const),
		Match.when(
			name =>
				name === 'webfetch' ||
				name === 'web_fetch' ||
				name === 'fetch' ||
				name === 'web_search' ||
				name === 'url' ||
				name === 'search' ||
				(name?.includes('web') === true && name.includes('search')) ||
				(name?.includes('web') === true && name.includes('fetch')),
			() => 'web' as const
		),
		Match.when('view', () => 'read' as const),
		Match.when('read', () => 'read' as const),
		Match.when('edit', () => 'write' as const),
		Match.when('write', () => 'write' as const),
		Match.when('create_file', () => 'write' as const),
		Match.when('patch', () => 'patch' as const),
		Match.when('str_replace_editor', () => 'patch' as const),
		Match.when('bash', () => 'bash' as const),
		Match.when('shell', () => 'bash' as const),
		Match.when('glob', () => 'glob' as const),
		Match.when('grep', () => 'grep' as const),
		Match.orElse(() => 'other' as const)
	)
}

function normalizeCopilotToolInput(toolName: string | undefined, input: unknown) {
	if (typeof input !== 'object' || input === null) {
		return input
	}

	const record = input as Record<string, unknown>

	return Match.value(resolveCopilotToolKind(toolName)).pipe(
		Match.when('question', () => {
			const question = record['question']
			if (typeof question !== 'string' || question.length === 0) {
				return input
			}

			const choices = record['choices']
			const optionsValue = record['options']
			let rawChoices: readonly unknown[] = []
			if (Array.isArray(choices)) {
				rawChoices = choices
			} else if (Array.isArray(optionsValue)) {
				rawChoices = optionsValue
			}

			const allowFreeform = record['allowFreeform']
			const header = record['header']
			const multiple = record['multiple']
			const options = rawChoices.flatMap(choice => {
				if (typeof choice === 'string') {
					return [makeToolOption({label: choice})]
				}

				if (typeof choice !== 'object' || choice === null) {
					return []
				}

				const optionRecord = choice as Record<string, unknown>
				const label = optionRecord['label']
				if (typeof label !== 'string' || label.length === 0) {
					return []
				}

				return [
					makeToolOption({
						description: typeof optionRecord['description'] === 'string' ? optionRecord['description'] : undefined,
						label
					})
				]
			})

			return makeQuestionToolInput({
				questions: [
					makeToolQuestion({
						allowFreeform: typeof allowFreeform === 'boolean' ? allowFreeform : undefined,
						header: typeof header === 'string' ? header : undefined,
						multiple: typeof multiple === 'boolean' ? multiple : undefined,
						options,
						question
					})
				]
			})
		}),
		Match.when('web', () => {
			const queryValue = record['query']
			const searchTerm = record['searchTerm']
			const urlValue = record['url']
			const uri = record['uri']
			let query: string | undefined
			if (typeof queryValue === 'string') {
				query = queryValue
			} else if (typeof searchTerm === 'string') {
				query = searchTerm
			}

			let url: string | undefined
			if (typeof urlValue === 'string') {
				url = urlValue
			} else if (typeof uri === 'string') {
				url = uri
			}

			return makeWebToolInput({query, url})
		}),
		Match.when('bash', () => {
			const commandValue = record['command']
			const fullCommandText = record['fullCommandText']
			const bashCommand = record['bashCommand']
			let command: string | undefined
			if (typeof commandValue === 'string') {
				command = commandValue
			} else if (typeof fullCommandText === 'string') {
				command = fullCommandText
			} else if (typeof bashCommand === 'string') {
				command = bashCommand
			}

			return typeof command === 'string' && command.length > 0 ? makeCommandToolInput(command) : input
		}),
		Match.when('read', () => {
			const pathValue = record['path']
			const filePath = record['filePath']
			let path: string | undefined
			if (typeof pathValue === 'string') {
				path = pathValue
			} else if (typeof filePath === 'string') {
				path = filePath
			}

			return typeof path === 'string' && path.length > 0 ? makePathToolInput(path) : input
		}),
		Match.when('write', () => {
			const pathValue = record['path']
			const filePath = record['filePath']
			let path: string | undefined
			if (typeof pathValue === 'string') {
				path = pathValue
			} else if (typeof filePath === 'string') {
				path = filePath
			}

			return typeof path === 'string' && path.length > 0 ? makePathToolInput(path) : input
		}),
		Match.when('patch', () => {
			const pathValue = record['path']
			const filePath = record['filePath']
			let path: string | undefined
			if (typeof pathValue === 'string') {
				path = pathValue
			} else if (typeof filePath === 'string') {
				path = filePath
			}

			return typeof path === 'string' && path.length > 0 ? makePathToolInput(path) : input
		}),
		Match.when('glob', () => {
			const patternValue = record['pattern']
			const queryValue = record['query']
			let pattern: string | undefined
			if (typeof patternValue === 'string') {
				pattern = patternValue
			} else if (typeof queryValue === 'string') {
				pattern = queryValue
			}

			return typeof pattern === 'string' && pattern.length > 0 ? makePatternToolInput(pattern) : input
		}),
		Match.when('grep', () => {
			const patternValue = record['pattern']
			const queryValue = record['query']
			let pattern: string | undefined
			if (typeof patternValue === 'string') {
				pattern = patternValue
			} else if (typeof queryValue === 'string') {
				pattern = queryValue
			}

			return typeof pattern === 'string' && pattern.length > 0 ? makePatternToolInput(pattern) : input
		}),
		Match.orElse(() => input)
	)
}

function normalizeCopilotToolOutput(toolName: string | undefined, output: unknown) {
	return Match.value(resolveCopilotToolKind(toolName)).pipe(
		Match.when('question', () => {
			const decoded = decodeToolValueOrUndefined(TextToolOutput, output)
			const rawText = typeof output === 'string' ? output : undefined
			const text = decoded?.text ?? rawText
			if (typeof text === 'string' && text.length > 0) {
				return makeQuestionToolOutput({answers: [makeQuestionToolAnswer({answer: text, wasFreeform: true})]})
			}

			return output
		}),
		Match.when('web', () => {
			const decoded = decodeToolValueOrUndefined(WebToolOutput, output)
			return decoded ?? output
		}),
		Match.when('bash', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.when('write', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.when('patch', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.when('glob', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.when('grep', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.when('read', () => makeTextToolOutput(stringifyToolValue(output))),
		Match.orElse(() => output)
	)
}

function assistantStream(
	session: Awaited<ReturnType<CopilotClient['createSession']>>,
	selection: ModelSelection,
	prompt: string,
	questionToolCallIds: Map<string, string[]>,
	toolNames: Map<string, string>,
	toolInputs: Map<string, unknown>
) {
	return Stream.callback<ConversationPart, AiError>(
		Effect.fnUntraced(function* (queue) {
			const turnHasToolCalls = yield* Ref.make(false)
			const usage = yield* Ref.make({input: 0, output: 0, reasoning: 0})
			const runFork = Effect.runForkWith(yield* Effect.services<Scope.Scope>())

			const onEvent = Effect.fnUntraced(function* (event: SessionEvent) {
				switch (event.type) {
					case 'assistant.turn_start':
						yield* Ref.set(turnHasToolCalls, false)
						return yield* Queue.offer(queue, makeStartPart({model: selection, role: 'assistant'}))
					case 'assistant.message_delta':
						return yield* Queue.offer(
							queue,
							makeTextDeltaPart({id: event.data.messageId, text: event.data.deltaContent})
						)
					case 'assistant.reasoning_delta':
						return yield* Queue.offer(
							queue,
							makeReasoningDeltaPart({id: event.data.reasoningId, text: event.data.deltaContent})
						)
					case 'assistant.intent':
						return
					case 'tool.execution_start': {
						if (isCopilotIntentTool(event.data.toolName)) {
							toolNames.set(event.data.toolCallId, event.data.toolName)
							const intent = extractCopilotIntent(event.data.arguments)
							if (!intent) {
								return
							}

							return yield* Queue.offer(queue, makeReasoningDeltaPart({id: event.data.toolCallId, text: intent}))
						}

						yield* Ref.set(turnHasToolCalls, true)
						const input = normalizeCopilotToolInput(event.data.toolName, event.data.arguments)
						const toolKind = resolveCopilotToolKind(event.data.toolName)
						toolNames.set(event.data.toolCallId, event.data.toolName)
						toolInputs.set(event.data.toolCallId, input)
						if (toolKind === 'question') {
							enqueueQuestionToolCallId(questionToolCallIds, input, event.data.toolCallId)
						}
						return yield* Queue.offer(
							queue,
							makeToolCallPart({
								input,
								toolCallId: event.data.toolCallId,
								toolKind,
								toolName: event.data.toolName
							})
						)
					}
					case 'tool.execution_complete': {
						const toolName = toolNames.get(event.data.toolCallId)
						if (isCopilotIntentTool(toolName)) {
							toolNames.delete(event.data.toolCallId)
							toolInputs.delete(event.data.toolCallId)
							return
						}

						const resolvedToolName = toolName ?? 'tool'
						const toolKind = resolveCopilotToolKind(resolvedToolName)
						const toolInput = toolInputs.get(event.data.toolCallId)
						if (toolKind === 'question') {
							deleteQuestionToolCallId(questionToolCallIds, event.data.toolCallId)
						}
						toolNames.delete(event.data.toolCallId)
						toolInputs.delete(event.data.toolCallId)

						if (event.data.success) {
							return yield* Queue.offer(
								queue,
								makeToolResultPart({
									output: normalizeCopilotToolOutput(resolvedToolName, event.data.result ?? null),
									toolCallId: event.data.toolCallId,
									toolKind,
									toolName: resolvedToolName
								})
							)
						}

						return yield* Queue.offer(
							queue,
							makeToolErrorPart({
								error: event.data.error ?? toolInput,
								toolCallId: event.data.toolCallId,
								toolKind,
								toolName: resolvedToolName
							})
						)
					}
					case 'assistant.usage':
						yield* Ref.update(usage, current => ({
							input: current.input + (event.data.inputTokens ?? 0),
							output: current.output + (event.data.outputTokens ?? 0),
							reasoning: current.reasoning
						}))
						return
					case 'assistant.turn_end':
						return yield* Queue.offer(
							queue,
							makeFinishPart({
								finishReason: (yield* Ref.get(turnHasToolCalls)) ? 'tool-calls' : 'stop',
								usage: yield* Ref.get(usage)
							})
						)
					case 'session.error':
						yield* Queue.offer(queue, makeErrorPart(new Error(event.data.message)))
						yield* Queue.offer(queue, makeFinishPart({finishReason: 'error', usage: yield* Ref.get(usage)}))
						return yield* Queue.end(queue)
					case 'session.idle':
						return yield* Queue.end(queue)
					default:
						return
				}
			})

			yield* Effect.acquireRelease(
				Effect.sync(() => session.on(event => void runFork(onEvent(event)))),
				unsubscribe => Effect.sync(unsubscribe)
			)

			yield* Effect.tryPromise({try: () => session.send({prompt}), catch: cause => new AiError({cause})})
		})
	)
}

function extractQuestionAnswer(output: unknown): QuestionAnswer {
	const decoded = decodeToolValueOrUndefined(QuestionToolOutput, output)
	if (decoded) {
		const firstAnswer = decoded.answers[0]
		if (firstAnswer) {
			return {
				answer: stringifyToolValue(firstAnswer.answer),
				wasFreeform: firstAnswer.wasFreeform
			}
		}
	}

	if (typeof output === 'string') {
		return {answer: output, wasFreeform: true}
	}

	if (typeof output === 'object' && output !== null) {
		const record = output as Record<string, unknown>
		const answers = record['answers']
		if (Array.isArray(answers)) {
			const firstAnswer = answers[0]
			if (typeof firstAnswer === 'object' && firstAnswer !== null) {
				const answerRecord = firstAnswer as Record<string, unknown>
				const answer = answerRecord['answer']
				return {
					answer: stringifyToolValue(answer),
					wasFreeform: answerRecord['wasFreeform'] === true
				}
			}
		}
	}

	return {answer: stringifyToolValue(output), wasFreeform: true}
}

export function CopilotSdkAgentLayer(input: {model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'copilot', model: input.model, provider: 'copilot'}
			const client = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: async () => {
						const instance = new CopilotClient({logLevel: 'error'})
						await instance.start()
						return instance
					},
					catch: cause => new AiError({cause})
				}),
				flow(
					instance => Effect.tryPromise({try: () => instance.stop(), catch: cause => new AiError({cause})}),
					Effect.ignore
				)
			)

			const events = yield* SubscriptionRef.make<ConversationPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<readonly ConversationMessage[]>([])
			const pendingApprovals = new Map<string, Deferred.Deferred<PermissionRequestResult>>()
			const pendingQuestions = new Map<string, Deferred.Deferred<QuestionAnswer>>()
			const questionToolCallIds = new Map<string, string[]>()
			const toolNames = new Map<string, string>()
			const toolInputs = new Map<string, unknown>()

			const runPromise = Effect.runPromiseWith(yield* Effect.services<Scope.Scope>())

			const session = yield* Effect.tryPromise({
				try: () =>
					client.createSession({
						model: selection.model,
						streaming: true,
						onPermissionRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const toolCallId = request.toolCallId ?? crypto.randomUUID()
									const toolName = toolNames.get(toolCallId) ?? request.kind
									const input = toolInputs.get(toolCallId) ?? request
									const part = makeToolApprovalRequestPart({
										input,
										toolCallId,
										toolKind: resolveCopilotToolKind(toolName),
										toolName
									})
									const deferred = yield* Deferred.make<PermissionRequestResult>()
									pendingApprovals.set(part.approvalId, deferred)
									yield* applyConversationPartStream(events, history, Stream.fromIterable([part]))
									return yield* Deferred.await(deferred)
								})
							),
						onUserInputRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const input = makeUserInputQuestionToolInput(request)
									const toolCallId = takeQuestionToolCallId(questionToolCallIds, input) ?? crypto.randomUUID()
									toolInputs.set(toolCallId, input)
									const deferred = yield* Deferred.make<QuestionAnswer>()
									pendingQuestions.set(toolCallId, deferred)

									if (!toolNames.has(toolCallId)) {
										toolNames.set(toolCallId, 'question')
										yield* applyConversationPartStream(
											events,
											history,
											Stream.fromIterable([
												makeToolCallPart({
													input,
													toolCallId,
													toolKind: 'question',
													toolName: 'question'
												})
											])
										)
									}

									return yield* Deferred.await(deferred)
								})
							)
					}),
				catch: cause => new AiError({cause})
			})

			return Agent.of({
				history: SubscriptionRef.changes(history),
				prompt: Effect.fnUntraced(function* (parts: readonly UserMessagePart[]) {
					yield* applyConversationPartStream(
						events,
						history,
						Stream.fromIterable(createUserTurnParts({model: selection, parts}))
					)
					yield* applyConversationPartStream(
						events,
						history,
						assistantStream(
							session,
							selection,
							parts.flatMap(part => (part._tag === 'text' ? [part.text] : [])).join('\n'),
							questionToolCallIds,
							toolNames,
							toolInputs
						)
					)
				}),
				respond: Effect.fnUntraced(function* (part: ToolMessagePart) {
					yield* applyConversationPartStream(events, history, Stream.fromIterable([part]))

					if (part._tag === 'tool-approval-response') {
						const deferred = pendingApprovals.get(part.approvalId)
						pendingApprovals.delete(part.approvalId)
						if (deferred) {
							yield* Deferred.succeed(
								deferred,
								part.approved ? {kind: 'approved'} : {kind: 'denied-interactively-by-user'}
							)
						}
						return
					}

					const deferred = pendingQuestions.get(part.toolCallId)
					pendingQuestions.delete(part.toolCallId)
					if (deferred) {
						yield* Deferred.succeed(deferred, extractQuestionAnswer(part.output))
					}
				}),
				stream: pipe(
					SubscriptionRef.changes(events),
					Stream.filter(Predicate.isNotUndefined)
				) as Stream.Stream<MessageStreamPart>
			})
		})()
	)
}
