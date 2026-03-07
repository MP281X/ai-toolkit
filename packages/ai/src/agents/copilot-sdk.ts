import type {Scope} from 'effect'
import {Array, Deferred, Effect, flow, Layer, PubSub, Queue, Ref, Stream} from 'effect'

import {CopilotClient, type PermissionRequestResult, type SessionEvent} from '@github/copilot-sdk'

import type {ModelId, ModelSelection} from '../catalog.ts'
import {
	AiError,
	type ConversationMessage,
	type ConversationPart,
	createUserTurnParts,
	ErrorPart,
	FinishPart,
	publishConversationPartStream,
	ReasoningDeltaPart,
	StartPart,
	TextDeltaPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	type ToolResponsePart,
	ToolResultPart,
	type UserMessagePart
} from '../schema.ts'
import {Agent} from '../service.ts'
import {
	decodeToolValueOrUndefined,
	normalizeToolInput,
	normalizeToolOutput,
	QuestionToolInput,
	QuestionToolOutput,
	stringifyToolValue
} from '../tools.ts'

type QuestionAnswer = {answer: string; wasFreeform: boolean}

function makeUserInputQuestionToolInput(input: {
	allowFreeform?: boolean
	choices?: readonly string[]
	question: string
}) {
	return QuestionToolInput.makeUnsafe({
		questions: [
			{
				allowFreeform: input.allowFreeform,
				header: 'Question',
				options: (input.choices ?? []).map(choice => ({label: choice})),
				question: input.question
			}
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
		options: (question.options ?? []).map((option: {label: string; description?: string}) => [
			option.label,
			option.description
		]),
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
	const normalized = toolName?.toLowerCase()
	return normalized === 'report_intent' || normalized === 'assistant.intent' || normalized === 'intent'
}

function extractCopilotIntent(input: unknown) {
	if (typeof input !== 'object' || input === null) {
		return undefined
	}

	const record = input as Record<string, unknown>
	const intent = record['intent']
	const text = record['text']
	if (typeof intent === 'string' && intent.trim().length > 0) {
		return intent.trim()
	}
	if (typeof text === 'string' && text.trim().length > 0) {
		return text.trim()
	}
	return undefined
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
						yield* Ref.set(usage, {input: 0, output: 0, reasoning: 0})
						return yield* Queue.offer(queue, StartPart.makeUnsafe({model: selection, role: 'assistant'}))
					case 'assistant.message_delta':
						return yield* Queue.offer(
							queue,
							TextDeltaPart.makeUnsafe({id: event.data.messageId, text: event.data.deltaContent})
						)
					case 'assistant.reasoning_delta':
						return yield* Queue.offer(
							queue,
							ReasoningDeltaPart.makeUnsafe({id: event.data.reasoningId, text: event.data.deltaContent})
						)
					case 'tool.execution_start': {
						if (isCopilotIntentTool(event.data.toolName)) {
							toolNames.set(event.data.toolCallId, event.data.toolName)
							const intent = extractCopilotIntent(event.data.arguments)
							if (!intent) {
								return
							}

							return yield* Queue.offer(queue, ReasoningDeltaPart.makeUnsafe({id: event.data.toolCallId, text: intent}))
						}

						yield* Ref.set(turnHasToolCalls, true)
						const input = normalizeToolInput(event.data.toolName, event.data.arguments)
						toolNames.set(event.data.toolCallId, event.data.toolName)
						toolInputs.set(event.data.toolCallId, input)
						if (event.data.toolName.toLowerCase() === 'question' || event.data.toolName.toLowerCase() === 'ask_user') {
							enqueueQuestionToolCallId(questionToolCallIds, input, event.data.toolCallId)
						}

						return yield* Queue.offer(
							queue,
							ToolCallPart.makeUnsafe({
								input,
								toolCallId: event.data.toolCallId,
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
						const toolInput = toolInputs.get(event.data.toolCallId)
						if (resolvedToolName.toLowerCase() === 'question' || resolvedToolName.toLowerCase() === 'ask_user') {
							deleteQuestionToolCallId(questionToolCallIds, event.data.toolCallId)
						}
						toolNames.delete(event.data.toolCallId)
						toolInputs.delete(event.data.toolCallId)

						if (event.data.success) {
							return yield* Queue.offer(
								queue,
								ToolResultPart.makeUnsafe({
									output: normalizeToolOutput(resolvedToolName, event.data.result ?? null, toolInput),
									toolCallId: event.data.toolCallId,
									toolName: resolvedToolName
								})
							)
						}

						return yield* Queue.offer(
							queue,
							ToolErrorPart.makeUnsafe({
								error: event.data.error ?? toolInput,
								toolCallId: event.data.toolCallId,
								toolName: resolvedToolName
							})
						)
					}
					case 'assistant.usage':
						return yield* Ref.update(usage, current => ({
							input: current.input + (event.data.inputTokens ?? 0),
							output: current.output + (event.data.outputTokens ?? 0),
							reasoning: current.reasoning
						}))
					case 'assistant.turn_end':
						return yield* Queue.offer(
							queue,
							FinishPart.makeUnsafe({
								finishReason: (yield* Ref.get(turnHasToolCalls)) ? 'tool-calls' : 'stop',
								usage: yield* Ref.get(usage)
							})
						)
					case 'session.error':
						yield* Queue.offer(queue, ErrorPart.makeUnsafe({error: new Error(event.data.message)}))
						yield* Queue.offer(queue, FinishPart.makeUnsafe({finishReason: 'error', usage: yield* Ref.get(usage)}))
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
	const firstAnswer = decoded?.answers[0]
	if (firstAnswer) {
		return {
			answer: stringifyToolValue(firstAnswer.answer),
			wasFreeform: firstAnswer.wasFreeform
		}
	}

	if (typeof output === 'object' && output !== null) {
		const record = output as Record<string, unknown>
		const answers = record['answers']
		if (Array.isArray(answers)) {
			const answer = answers[0]
			if (typeof answer === 'object' && answer !== null) {
				const answerRecord = answer as Record<string, unknown>
				return {
					answer: stringifyToolValue(answerRecord['answer']),
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

			const events = yield* PubSub.unbounded<ConversationPart>({replay: 100_000})
			const history = yield* Ref.make<readonly ConversationMessage[]>([])
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
									const part = ToolApprovalRequestPart.makeUnsafe({
										input,
										toolCallId,
										toolName
									})
									const deferred = yield* Deferred.make<PermissionRequestResult>()
									pendingApprovals.set(part.approvalId, deferred)
									yield* publishConversationPartStream(history, events, Stream.fromIterable([part]))
									return yield* Deferred.await(deferred)
								})
							),
						onUserInputRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const questionInput = makeUserInputQuestionToolInput(request)
									const toolCallId = takeQuestionToolCallId(questionToolCallIds, questionInput) ?? crypto.randomUUID()
									toolInputs.set(toolCallId, questionInput)
									const deferred = yield* Deferred.make<QuestionAnswer>()
									pendingQuestions.set(toolCallId, deferred)

									if (!toolNames.has(toolCallId)) {
										toolNames.set(toolCallId, 'question')
										yield* publishConversationPartStream(
											history,
											events,
											Stream.fromIterable([
												ToolCallPart.makeUnsafe({
													input: questionInput,
													toolCallId,
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
				prompt: Effect.fnUntraced(function* (parts: readonly UserMessagePart[]) {
					yield* publishConversationPartStream(
						history,
						events,
						Stream.fromIterable(createUserTurnParts({model: selection, parts}))
					)
					yield* publishConversationPartStream(
						history,
						events,
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
				respond: Effect.fnUntraced(function* (part: ToolResponsePart) {
					yield* publishConversationPartStream(history, events, Stream.fromIterable([part]))

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
				stream: Stream.fromPubSub(events)
			})
		})()
	)
}
