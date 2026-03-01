import {Array, Effect, Layer, Option, Predicate, pipe, Queue, Ref, Stream, SubscriptionRef} from 'effect'

import {CopilotClient, type SessionEvent} from '@github/copilot-sdk'

import {type ModelId, type ModelSelection, offerings, providers} from '../catalog.ts'
import type {ConversationMessage, StreamPart, ToolResponsePart, UserContentPart} from '../schema.ts'
import {
	AiError,
	applyPartsStream,
	ErrorPart,
	Finish,
	partsStreamWithStartFinish,
	ReasoningPart,
	Start,
	TextPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	ToolResultPart
} from '../schema.ts'
import {Agent} from '../service.ts'

const ensureCopilotModel = Effect.fnUntraced(function* (selection: ModelSelection) {
	yield* pipe(
		Array.findFirst(providers, provider => provider.id === selection.provider),
		Option.match({
			onSome: () => Effect.void,
			onNone: () => new AiError({message: 'Provider not found'})
		})
	)
	yield* pipe(
		Array.findFirst(
			offerings,
			offering =>
				Array.contains(offering.agents, 'copilot') &&
				offering.provider === selection.provider &&
				offering.model === selection.model
		),
		Option.match({
			onSome: () => Effect.void,
			onNone: () => new AiError({message: 'Model offering not found'})
		})
	)
})

function userPartsToPrompt(parts: readonly UserContentPart[]) {
	return pipe(
		parts,
		Array.map(part => (part._tag === 'text-part' ? part.text : `file:${part.filename ?? 'attachment'}`)),
		Array.join('')
	)
}

function outputToAnswer(output: unknown) {
	if (typeof output === 'string') return output
	return JSON.stringify(output)
}

function userStream(selection: ModelSelection, parts: readonly UserContentPart[]) {
	return partsStreamWithStartFinish(selection, 'user', parts)
}

function toolStream(selection: ModelSelection, parts: readonly ToolResponsePart[]) {
	return partsStreamWithStartFinish(selection, 'tool', parts)
}

function singleAssistantPartStream(selection: ModelSelection, part: StreamPart) {
	return partsStreamWithStartFinish(selection, 'assistant', [part])
}

function promptStream(
	session: Awaited<ReturnType<CopilotClient['createSession']>>,
	selection: ModelSelection,
	parts: readonly UserContentPart[]
) {
	return Stream.callback<StreamPart>(
		Effect.fnUntraced(function* (queue) {
			const promptUsage = {input: 0, output: 0, reasoning: 0}
			const messageIdsWithDeltas = new Set<string>()
			let isFinished = false

			function finishWith(part: Finish) {
				if (isFinished) return
				isFinished = true
				Queue.offerUnsafe(queue, part)
				Queue.endUnsafe(queue)
			}

			function onEvent(event: SessionEvent) {
				switch (event.type) {
					case 'assistant.message_delta':
						messageIdsWithDeltas.add(event.data.messageId)
						Queue.offerUnsafe(queue, new TextPart({id: event.data.messageId, text: event.data.deltaContent}))
						return
					case 'assistant.reasoning_delta':
						Queue.offerUnsafe(queue, new ReasoningPart({id: event.data.reasoningId, text: event.data.deltaContent}))
						return
					case 'assistant.message':
						if (event.data.content && !messageIdsWithDeltas.has(event.data.messageId))
							Queue.offerUnsafe(queue, new TextPart({id: event.data.messageId, text: event.data.content}))
						for (const request of event.data.toolRequests ?? []) {
							Queue.offerUnsafe(
								queue,
								new ToolCallPart({toolCallId: request.toolCallId, toolName: request.name, input: request.arguments})
							)
						}
						return
					case 'tool.execution_complete': {
						if (event.data.success) {
							Queue.offerUnsafe(
								queue,
								new ToolResultPart({toolCallId: event.data.toolCallId, toolName: 'tool', output: event.data.result})
							)
							return
						}
						Queue.offerUnsafe(
							queue,
							new ToolErrorPart({toolCallId: event.data.toolCallId, toolName: 'tool', error: event.data.error})
						)
						return
					}
					case 'assistant.usage':
						promptUsage.input += event.data.inputTokens ?? 0
						promptUsage.output += event.data.outputTokens ?? 0
						return
					case 'session.error':
						Queue.offerUnsafe(queue, new ErrorPart({error: new Error(event.data.message)}))
						finishWith(new Finish({finishReason: 'error', usage: promptUsage}))
						return
					case 'session.idle':
						finishWith(new Finish({finishReason: 'stop', usage: promptUsage}))
						return
				}
			}

			yield* Effect.acquireRelease(
				Effect.sync(() => session.on(onEvent)),
				unsubscribe => Effect.sync(unsubscribe)
			)

			Queue.offerUnsafe(queue, new Start({model: selection, role: 'assistant'}))
			void session.send({prompt: userPartsToPrompt(parts)}).catch(cause => {
				Queue.offerUnsafe(queue, new ErrorPart({error: cause}))
				finishWith(new Finish({finishReason: 'error', usage: promptUsage}))
			})
		})
	)
}

export function CopilotSdkAgentLayer(input: {model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'copilot', provider: 'copilot', model: input.model}
			yield* ensureCopilotModel(selection)

			const client = new CopilotClient()
			yield* Effect.tryPromise({
				try: () => client.start(),
				catch: cause => new AiError({cause})
			})

			const events = yield* SubscriptionRef.make<StreamPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<ConversationMessage[]>([])
			const sessionRef = yield* Ref.make<Awaited<ReturnType<CopilotClient['createSession']>> | undefined>(undefined)
			const pendingApprovals = new Map<string, (result: {kind: 'approved' | 'denied-interactively-by-user'}) => void>()
			const pendingQuestions = new Map<string, (result: {answer: string; wasFreeform: boolean}) => void>()
			let approvalIdSequence = 0
			let questionIdSequence = 0

			const ensureSession = Effect.fnUntraced(function* () {
				const existingSession = yield* Ref.get(sessionRef)
				if (!Predicate.isUndefined(existingSession)) return existingSession

				const createdSession = yield* Effect.tryPromise({
					try: () =>
						client.createSession({
							model: selection.model,
							streaming: true,
							onPermissionRequest: async (request: {toolCallId?: string}) => {
								const approvalId = `approval-${++approvalIdSequence}`
								const toolCallId = Predicate.isString(request.toolCallId)
									? request.toolCallId
									: `tool-call-${approvalIdSequence}`
								await Effect.runPromise(
									applyPartsStream(
										events,
										history,
										singleAssistantPartStream(selection, new ToolApprovalRequestPart({approvalId, toolCallId}))
									)
								)
								return await new Promise(resolve => pendingApprovals.set(approvalId, resolve))
							},
							onUserInputRequest: async (request: {question: string; choices?: string[]}) => {
								const toolCallId = `question-${++questionIdSequence}`
								await Effect.runPromise(
									applyPartsStream(
										events,
										history,
										singleAssistantPartStream(
											selection,
											new ToolCallPart({
												toolCallId,
												toolName: 'question',
												input: {
													questions: [
														{
															header: 'Question',
															question: request.question,
															options: pipe(
																request.choices ?? [],
																Array.map(choice => ({label: choice}))
															),
															multiple: false
														}
													]
												}
											})
										)
									)
								)
								return await new Promise(resolve => {
									pendingQuestions.set(toolCallId, resolve)
								})
							}
						}),
					catch: cause => new AiError({cause})
				})

				yield* Ref.set(sessionRef, createdSession)
				return createdSession
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts) {
					yield* applyPartsStream(events, history, userStream(selection, parts))
					const session = yield* ensureSession()
					yield* applyPartsStream(events, history, promptStream(session, selection, parts))
				}),
				respond: Effect.fnUntraced(function* (part) {
					const messages = yield* SubscriptionRef.get(history)
					if (Array.isArrayEmpty(messages)) return yield* new AiError({message: 'No active session'})

					yield* applyPartsStream(events, history, toolStream(selection, [part]))

					if (part._tag === 'tool-approval-response') {
						const pendingApproval = pendingApprovals.get(part.approvalId)
						pendingApprovals.delete(part.approvalId)
						pendingApproval?.(part.approved ? {kind: 'approved'} : {kind: 'denied-interactively-by-user'})
						return
					}

					const pendingQuestion = pendingQuestions.get(part.toolCallId)
					pendingQuestions.delete(part.toolCallId)
					pendingQuestion?.({answer: outputToAnswer(part.output), wasFreeform: true})
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history)
			})
		})()
	)
}
