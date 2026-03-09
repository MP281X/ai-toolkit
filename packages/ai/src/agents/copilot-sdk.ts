import type {Scope} from 'effect'
import {Deferred, Effect, flow, Layer, PubSub, Queue, Ref, Stream} from 'effect'

import {CopilotClient, type PermissionRequestResult, type SessionEvent} from '@github/copilot-sdk'

import type {ModelSelection} from '../catalog.ts'
import {
	AiError,
	type ConversationEvent,
	type ConversationMessage,
	createPromptEvents,
	MessageErrorEvent,
	MessageFinishEvent,
	MessageStartEvent,
	type PromptPart,
	publishConversationEventStream,
	ReasoningDeltaEvent,
	TextDeltaEvent,
	ToolApprovalRequestEvent,
	ToolCallEvent,
	ToolErrorEvent,
	type ToolResponse,
	ToolResultEvent,
	Usage
} from '../schema.ts'
import {Agent} from '../service.ts'
import {
	decodeToolValueOrUndefined,
	normalizeToolInput,
	normalizeToolKind,
	normalizeToolOutput,
	QuestionItem,
	QuestionToolInput,
	QuestionToolOutput,
	ReportIntentToolInput,
	stringifyToolValue
} from '../tools.ts'

function makeQuestionInput(request: {question: string; choices?: readonly string[]; allowFreeform?: boolean}) {
	return QuestionToolInput.makeUnsafe({
		questions: [
			QuestionItem.makeUnsafe({
				custom: request.allowFreeform,
				header: 'Question',
				options: (request.choices ?? []).map(choice => ({label: choice})),
				question: request.question
			})
		]
	})
}

function extractQuestionResponse(output: unknown) {
	const decoded = decodeToolValueOrUndefined(QuestionToolOutput, output)
	if (decoded?._tag === 'question') {
		const answer = decoded.answers[0]
		return {
			answer: answer ? answer.answers.join('\n') : '',
			wasFreeform: true
		}
	}

	return {
		answer: stringifyToolValue(output),
		wasFreeform: true
	}
}

function assistantEventStream(input: {
	session: Awaited<ReturnType<CopilotClient['createSession']>>
	selection: ModelSelection
	prompt: string
	toolInputs: Map<string, unknown>
	toolNames: Map<string, string>
	lastIntentRef: Ref.Ref<string | undefined>
	questionToolCallIdRef: Ref.Ref<string | undefined>
	messageIdRef: Ref.Ref<string | undefined>
}) {
	return Stream.callback<ConversationEvent, AiError>(
		Effect.fnUntraced(function* (queue) {
			const usage = yield* Ref.make(Usage.makeUnsafe({}))
			const hasToolCalls = yield* Ref.make(false)
			const runFork = Effect.runForkWith(yield* Effect.services<Scope.Scope>())

			const onEvent = Effect.fnUntraced(function* (event: SessionEvent) {
				if (event.type === 'assistant.turn_start') {
					const messageId = crypto.randomUUID()
					yield* Ref.set(input.messageIdRef, messageId)
					yield* Ref.set(usage, Usage.makeUnsafe({}))
					yield* Ref.set(hasToolCalls, false)
					yield* Ref.set(input.lastIntentRef, undefined)
					yield* Ref.set(input.questionToolCallIdRef, undefined)
					input.toolInputs.clear()
					input.toolNames.clear()
					return yield* Queue.offer(
						queue,
						MessageStartEvent.makeUnsafe({messageId, model: input.selection, role: 'assistant'})
					)
				}

				if (event.type === 'assistant.message_delta') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					return yield* Queue.offer(
						queue,
						TextDeltaEvent.makeUnsafe({messageId, partId: event.data.messageId, text: event.data.deltaContent})
					)
				}

				if (event.type === 'assistant.reasoning_delta') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					return yield* Queue.offer(
						queue,
						ReasoningDeltaEvent.makeUnsafe({
							kind: 'reasoning',
							messageId,
							partId: event.data.reasoningId,
							text: event.data.deltaContent
						})
					)
				}

				if (event.type === 'assistant.intent') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					const shouldEmit = yield* Ref.modify(input.lastIntentRef, prev => {
						if (prev === event.data.intent) return [false, prev] as const
						return [true, event.data.intent] as const
					})
					if (!shouldEmit) {
						return
					}
					const toolCallId = crypto.randomUUID()
					const toolInput = ReportIntentToolInput.makeUnsafe({intent: event.data.intent})
					input.toolInputs.set(toolCallId, toolInput)
					input.toolNames.set(toolCallId, 'report_intent')
					yield* Queue.offer(
						queue,
						ToolCallEvent.makeUnsafe({
							input: toolInput,
							messageId,
							partId: toolCallId,
							state: 'running',
							toolCallId,
							toolKind: 'report_intent',
							toolName: 'report_intent'
						})
					)
					return yield* Queue.offer(
						queue,
						ToolResultEvent.makeUnsafe({
							messageId,
							partId: toolCallId,
							toolCallId,
							toolKind: 'report_intent',
							toolName: 'report_intent'
						})
					)
				}

				if (event.type === 'tool.execution_start') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					if (normalizeToolKind(event.data.toolName) === 'question') {
						yield* Ref.set(input.questionToolCallIdRef, event.data.toolCallId)
						input.toolInputs.set(event.data.toolCallId, normalizeToolInput(event.data.toolName, event.data.arguments))
						input.toolNames.set(event.data.toolCallId, event.data.toolName)
						return
					}
					yield* Ref.set(hasToolCalls, true)
					const normalizedInput = normalizeToolInput(event.data.toolName, event.data.arguments)
					input.toolInputs.set(event.data.toolCallId, normalizedInput)
					input.toolNames.set(event.data.toolCallId, event.data.toolName)
					return yield* Queue.offer(
						queue,
						ToolCallEvent.makeUnsafe({
							input: normalizedInput,
							messageId,
							partId: event.data.toolCallId,
							state: normalizeToolKind(event.data.toolName) === 'question' ? 'pending-user-input' : 'running',
							toolCallId: event.data.toolCallId,
							toolKind: normalizeToolKind(event.data.toolName),
							toolName: event.data.toolName
						})
					)
				}

				if (event.type === 'tool.execution_complete') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					const toolName = input.toolNames.get(event.data.toolCallId) ?? event.data.toolCallId
					if (normalizeToolKind(toolName) === 'question') {
						if ((yield* Ref.get(input.questionToolCallIdRef)) === event.data.toolCallId) {
							yield* Ref.set(input.questionToolCallIdRef, undefined)
						}
						input.toolNames.delete(event.data.toolCallId)
						input.toolInputs.delete(event.data.toolCallId)
						return
					}
					const toolInput = input.toolInputs.get(event.data.toolCallId)
					input.toolNames.delete(event.data.toolCallId)
					input.toolInputs.delete(event.data.toolCallId)

					if (event.data.success) {
						return yield* Queue.offer(
							queue,
							ToolResultEvent.makeUnsafe({
								messageId,
								output: normalizeToolOutput(
									toolName,
									event.data.result?.detailedContent ?? event.data.result?.content ?? '',
									toolInput
								),
								partId: event.data.toolCallId,
								toolCallId: event.data.toolCallId,
								toolKind: normalizeToolKind(toolName),
								toolName
							})
						)
					}

					return yield* Queue.offer(
						queue,
						ToolErrorEvent.makeUnsafe({
							error: event.data.error?.message ?? 'Tool failed',
							messageId,
							partId: event.data.toolCallId,
							toolCallId: event.data.toolCallId,
							toolKind: normalizeToolKind(toolName),
							toolName
						})
					)
				}

				if (event.type === 'assistant.usage') {
					return yield* Ref.update(usage, current =>
						Usage.makeUnsafe({
							input: current.input + (event.data.inputTokens ?? 0),
							output: current.output + (event.data.outputTokens ?? 0),
							reasoning: current.reasoning
						})
					)
				}

				if (event.type === 'assistant.turn_end') {
					const messageId = yield* Ref.get(input.messageIdRef)
					if (messageId === undefined) {
						return
					}
					return yield* Queue.offer(
						queue,
						MessageFinishEvent.makeUnsafe({
							finishReason: (yield* Ref.get(hasToolCalls)) ? 'tool-calls' : 'stop',
							messageId,
							usage: yield* Ref.get(usage)
						})
					)
				}

				if (event.type === 'session.error') {
					const messageId = (yield* Ref.get(input.messageIdRef)) ?? crypto.randomUUID()
					yield* Queue.offer(
						queue,
						MessageErrorEvent.makeUnsafe({error: new Error(event.data.message), messageId, partId: crypto.randomUUID()})
					)
					yield* Queue.offer(
						queue,
						MessageFinishEvent.makeUnsafe({finishReason: 'error', messageId, usage: yield* Ref.get(usage)})
					)
					return yield* Queue.end(queue)
				}

				if (event.type === 'session.idle') {
					return yield* Queue.end(queue)
				}
			})

			yield* Effect.acquireRelease(
				Effect.sync(() => input.session.on(event => void runFork(Effect.ignore(onEvent(event))))),
				unsubscribe => Effect.sync(unsubscribe)
			)

			if (input.prompt.length === 0) {
				return
			}

			yield* Effect.tryPromise({
				try: () => input.session.send({prompt: input.prompt}),
				catch: cause => new AiError({cause})
			})
		})
	)
}

export function CopilotSdkAgentLayer(selection: ModelSelection) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
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

			const events = yield* PubSub.unbounded<ConversationEvent>({replay: 100_000})
			const history = yield* Ref.make<readonly ConversationMessage[]>([])
			const messageIdRef = yield* Ref.make<string | undefined>(undefined)
			const lastIntentRef = yield* Ref.make<string | undefined>(undefined)
			const questionToolCallIdRef = yield* Ref.make<string | undefined>(undefined)
			const pendingApprovals = new Map<string, Deferred.Deferred<PermissionRequestResult>>()
			const pendingQuestions = new Map<string, Deferred.Deferred<{answer: string; wasFreeform: boolean}>>()
			const approvalLookup = new Map<string, {messageId: string; toolCallId: string; toolName: string}>()
			const toolInputs = new Map<string, unknown>()
			const toolNames = new Map<string, string>()
			const runPromise = Effect.runPromiseWith(yield* Effect.services<Scope.Scope>())

			const session = yield* Effect.tryPromise({
				try: () =>
					client.createSession({
						model: selection.model,
						streaming: true,
						onPermissionRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const messageId = (yield* Ref.get(messageIdRef)) ?? crypto.randomUUID()
									const toolCallId = request.toolCallId ?? crypto.randomUUID()
									const toolName = toolNames.get(toolCallId) ?? request.kind
									const input = normalizeToolInput(toolName, toolInputs.get(toolCallId))
									const approvalId = crypto.randomUUID()
									approvalLookup.set(approvalId, {messageId, toolCallId, toolName})
									const deferred = yield* Deferred.make<PermissionRequestResult>()
									pendingApprovals.set(approvalId, deferred)
									yield* publishConversationEventStream(
										history,
										events,
										Stream.fromIterable([
											ToolApprovalRequestEvent.makeUnsafe({
												approvalId,
												input,
												messageId,
												partId: approvalId,
												toolCallId,
												toolKind: normalizeToolKind(toolName),
												toolName
											})
										])
									)
									return yield* Deferred.await(deferred)
								})
							),
						onUserInputRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const messageId = (yield* Ref.get(messageIdRef)) ?? crypto.randomUUID()
									const toolCallId = (yield* Ref.get(questionToolCallIdRef)) ?? crypto.randomUUID()
									const toolInput = makeQuestionInput(request)
									const deferred = yield* Deferred.make<{answer: string; wasFreeform: boolean}>()
									pendingQuestions.set(toolCallId, deferred)
									yield* Ref.set(questionToolCallIdRef, toolCallId)
									toolInputs.set(toolCallId, toolInput)
									toolNames.set(toolCallId, 'question')
									yield* publishConversationEventStream(
										history,
										events,
										Stream.fromIterable([
											ToolCallEvent.makeUnsafe({
												input: toolInput,
												messageId,
												partId: toolCallId,
												requestId: toolCallId,
												state: 'pending-user-input',
												toolCallId,
												toolKind: 'question',
												toolName: 'question'
											})
										])
									)
									return yield* Deferred.await(deferred)
								})
							)
					}),
				catch: cause => new AiError({cause})
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts: readonly PromptPart[]) {
					yield* publishConversationEventStream(
						history,
						events,
						Stream.fromIterable(createPromptEvents({model: selection, parts}))
					)
					yield* publishConversationEventStream(
						history,
						events,
						assistantEventStream({
							lastIntentRef,
							messageIdRef,
							prompt: parts.flatMap(part => (part._tag === 'text' ? [part.text] : [])).join('\n'),
							questionToolCallIdRef,
							selection,
							session,
							toolInputs,
							toolNames
						})
					)
				}),
				respond: Effect.fnUntraced(function* (response: ToolResponse) {
					if (response._tag === 'tool-approval-response') {
						yield* publishConversationEventStream(history, events, Stream.fromIterable([response]))
						const deferred = pendingApprovals.get(response.approvalId)
						pendingApprovals.delete(response.approvalId)
						approvalLookup.delete(response.approvalId)
						if (deferred) {
							yield* Deferred.succeed(
								deferred,
								response.decision === 'approve' ? {kind: 'approved'} : {kind: 'denied-interactively-by-user'}
							)
						}
						return
					}

					if (response.toolKind !== 'question') {
						return
					}

					yield* publishConversationEventStream(
						history,
						events,
						Stream.fromIterable([
							ToolResultEvent.makeUnsafe({
								messageId: response.messageId,
								output: response.output,
								partId: response.partId,
								requestId: response.requestId,
								toolCallId: response.toolCallId,
								toolKind: response.toolKind,
								toolName: response.toolName
							})
						])
					)

					const deferred = pendingQuestions.get(response.toolCallId)
					pendingQuestions.delete(response.toolCallId)
					if (deferred) {
						yield* Deferred.succeed(deferred, extractQuestionResponse(response.output))
					}
				}),
				stream: Stream.fromPubSub(events)
			})
		})()
	)
}
