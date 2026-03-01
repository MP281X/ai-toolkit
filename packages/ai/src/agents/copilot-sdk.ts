import {Array, Effect, Layer, Option, Predicate, pipe, Queue, Ref, Stream, SubscriptionRef} from 'effect'

import {CopilotClient, type SessionEvent} from '@github/copilot-sdk'

import {type ModelSelection, offerings, providers} from '../catalog.ts'
import type {ConversationMessage, StreamPart, ToolResponsePart, UserContentPart} from '../schema.ts'
import {
	AiError,
	ErrorPart,
	Finish,
	partsStreamToMessage,
	ReasoningPart,
	Start,
	TextPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	ToolResultPart,
	ToolResultResponsePart
} from '../schema.ts'
import {Agent, Model} from '../service.ts'

function findProvider(providerId: ModelSelection['provider']) {
	return Array.findFirst(providers, provider => provider.id === providerId)
}

function findOffering(selection: ModelSelection) {
	return Array.findFirst(
		offerings,
		offering =>
			Array.contains(offering.agents, 'copilot') &&
			offering.provider === selection.provider &&
			offering.model === selection.model
	)
}

function ensureCopilotModel(selection: ModelSelection) {
	return Effect.gen(function* () {
		const provider = yield* pipe(
			findProvider(selection.provider),
			Option.match({
				onSome: provider => Effect.succeed(provider),
				onNone: () => new AiError({message: 'Provider not found'}).asEffect()
			})
		)
		yield* pipe(
			findOffering(selection),
			Option.match({
				onSome: () => Effect.void,
				onNone: () => new AiError({message: 'Model offering not found'})
			})
		)

		return {selection, provider}
	})
}

function zeroUsage() {
	return {input: 0, output: 0, reasoning: 0}
}

function userPartsToPrompt(parts: readonly UserContentPart[]) {
	return parts
		.map(part => {
			if (part._tag === 'text-part') return part.text
			return `file:${part.filename ?? 'attachment'}`
		})
		.join('\n')
}

function outputToAnswer(output: unknown) {
	if (typeof output === 'string') return output
	if (!Array.isArray(output)) return JSON.stringify(output)

	const values = output
		.map(item => {
			if (typeof item !== 'object' || item === null || !('response' in item)) return ''
			const response = item.response
			if (!Array.isArray(response)) return ''
			return response.join(', ')
		})
		.filter(Boolean)

	if (values.length > 0) return values.join('\n')
	return JSON.stringify(output)
}

function userStream(selection: ModelSelection, parts: readonly UserContentPart[]) {
	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'user'})),
		Stream.concat(Stream.fromIterable(parts), Stream.succeed(new Finish({finishReason: 'stop', usage: zeroUsage()})))
	)
}

function toolStream(selection: ModelSelection, parts: readonly ToolResponsePart[]) {
	const values = parts.map(part => {
		if (part._tag === 'tool-result-response') {
			return new ToolResultResponsePart({toolCallId: part.toolCallId, toolName: part.toolName, output: part.output})
		}
		return part
	})

	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'tool'})),
		Stream.concat(Stream.fromIterable(values), Stream.succeed(new Finish({finishReason: 'stop', usage: zeroUsage()})))
	)
}

function assistantSinglePartStream(selection: ModelSelection, part: StreamPart) {
	return Stream.concat(
		Stream.succeed(new Start({model: selection, startedAt: Date.now(), role: 'assistant'})),
		Stream.concat(Stream.succeed(part), Stream.succeed(new Finish({finishReason: 'stop', usage: zeroUsage()})))
	)
}

function upsertMessage(messages: readonly ConversationMessage[], message: ConversationMessage) {
	const previous = messages[messages.length - 1]
	if (!previous) return [...messages, message]
	if (previous.startedAt !== message.startedAt || previous.role !== message.role) return [...messages, message]
	return [...messages.slice(0, -1), message]
}

function applyStream(
	events: SubscriptionRef.SubscriptionRef<StreamPart | undefined>,
	history: SubscriptionRef.SubscriptionRef<ConversationMessage[]>,
	stream: Stream.Stream<StreamPart, AiError>
) {
	return pipe(
		stream,
		Stream.mapEffect(part => pipe(SubscriptionRef.set(events, part), Effect.as(part))),
		partsStreamToMessage,
		Stream.mapEffect(message => SubscriptionRef.update(history, current => upsertMessage(current, message))),
		Stream.runDrain
	)
}

function promptStream(
	session: Awaited<ReturnType<CopilotClient['createSession']>>,
	selection: ModelSelection,
	parts: readonly UserContentPart[]
) {
	return Stream.callback<StreamPart>(
		Effect.fnUntraced(function* (queue) {
			const usage = {input: 0, output: 0, reasoning: 0}
			const toolNameByCallId = new Map<string, string>()
			const deltaMessageIds = new Set<string>()
			let finished = false

			function finishWith(part: Finish) {
				if (finished) return
				finished = true
				Queue.offerUnsafe(queue, part)
				Queue.endUnsafe(queue)
			}

			function onEvent(event: SessionEvent) {
				if (event.type === 'assistant.message_delta') {
					deltaMessageIds.add(event.data.messageId)
					Queue.offerUnsafe(queue, new TextPart({id: event.data.messageId, text: event.data.deltaContent}))
					return
				}

				if (event.type === 'assistant.reasoning_delta') {
					Queue.offerUnsafe(queue, new ReasoningPart({id: event.data.reasoningId, text: event.data.deltaContent}))
					return
				}

				if (event.type === 'assistant.message') {
					if (!deltaMessageIds.has(event.data.messageId) && event.data.content) {
						Queue.offerUnsafe(queue, new TextPart({id: event.data.messageId, text: event.data.content}))
					}

					for (const request of event.data.toolRequests ?? []) {
						toolNameByCallId.set(request.toolCallId, request.name)
						Queue.offerUnsafe(
							queue,
							new ToolCallPart({toolCallId: request.toolCallId, toolName: request.name, input: request.arguments})
						)
					}
					return
				}

				if (event.type === 'tool.execution_start') {
					toolNameByCallId.set(event.data.toolCallId, event.data.toolName)
					return
				}

				if (event.type === 'tool.execution_complete') {
					const toolName = toolNameByCallId.get(event.data.toolCallId) ?? 'tool'
					if (event.data.success) {
						Queue.offerUnsafe(
							queue,
							new ToolResultPart({
								toolCallId: event.data.toolCallId,
								toolName,
								input: undefined,
								output: event.data.result
							})
						)
						return
					}

					Queue.offerUnsafe(
						queue,
						new ToolErrorPart({toolCallId: event.data.toolCallId, toolName, input: undefined, error: event.data.error})
					)
					return
				}

				if (event.type === 'assistant.usage') {
					usage.input += event.data.inputTokens ?? 0
					usage.output += event.data.outputTokens ?? 0
					return
				}

				if (event.type === 'session.error') {
					Queue.offerUnsafe(queue, new ErrorPart({error: new Error(event.data.message)}))
					finishWith(new Finish({finishReason: 'error', usage}))
					return
				}

				if (event.type === 'session.idle') {
					finishWith(new Finish({finishReason: 'stop', usage}))
				}
			}

			yield* Effect.acquireRelease(
				Effect.sync(() => session.on(onEvent)),
				unsubscribe => Effect.sync(unsubscribe)
			)

			Queue.offerUnsafe(queue, new Start({model: selection, startedAt: Date.now(), role: 'assistant'}))
			void session.send({prompt: userPartsToPrompt(parts)}).catch(cause => {
				Queue.offerUnsafe(queue, new ErrorPart({error: cause}))
				finishWith(new Finish({finishReason: 'error', usage}))
			})
		})
	)
}

export const CopilotSdkModel = {
	layer: (input: ModelSelection) =>
		Layer.effect(
			Model,
			Effect.gen(function* () {
				yield* ensureCopilotModel(input)
				return input
			})
		)
}

export const CopilotSdkAgent = {
	layer: Layer.effect(
		Agent,
		Effect.gen(function* () {
			const selection = yield* Model
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
				const existing = yield* Ref.get(sessionRef)
				if (existing) return existing

				const session = yield* Effect.tryPromise({
					try: () =>
						client.createSession({
							model: selection.model,
							streaming: true,
							onPermissionRequest: async (request: {toolCallId?: string}) => {
								const approvalId = `approval-${++approvalIdSequence}`
								const toolCallId =
									typeof request.toolCallId === 'string' ? request.toolCallId : `tool-call-${approvalIdSequence}`
								await Effect.runPromise(
									applyStream(
										events,
										history,
										assistantSinglePartStream(selection, new ToolApprovalRequestPart({approvalId, toolCallId}))
									)
								)
								return await new Promise(resolve => {
									pendingApprovals.set(approvalId, resolve)
								})
							},
							onUserInputRequest: async (request: {question: string; choices?: string[]}) => {
								const toolCallId = `question-${++questionIdSequence}`
								await Effect.runPromise(
									applyStream(
										events,
										history,
										assistantSinglePartStream(
											selection,
											new ToolCallPart({
												toolCallId,
												toolName: 'question',
												input: {
													questions: [
														{
															header: 'Question',
															question: request.question,
															options: request.choices?.map(choice => ({label: choice})),
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

				yield* Ref.set(sessionRef, session)
				return session
			})

			return {
				prompt: Effect.fn(function* (parts) {
					yield* applyStream(events, history, userStream(selection, parts))
					const session = yield* ensureSession()
					yield* applyStream(events, history, promptStream(session, selection, parts))
				}),
				respond: Effect.fn(function* (parts) {
					const messages = yield* SubscriptionRef.get(history)
					if (messages.length === 0) return yield* new AiError({message: 'No active session'}).asEffect()

					yield* applyStream(events, history, toolStream(selection, parts))

					for (const part of parts) {
						if (part._tag === 'tool-approval-response') {
							const pending = pendingApprovals.get(part.approvalId)
							if (!pending) return yield* new AiError({message: 'Approval not found'}).asEffect()
							pendingApprovals.delete(part.approvalId)
							pending(part.approved ? {kind: 'approved'} : {kind: 'denied-interactively-by-user'})
							continue
						}

						const pending = pendingQuestions.get(part.toolCallId)
						if (!pending) return yield* new AiError({message: 'User input request not found'}).asEffect()
						pendingQuestions.delete(part.toolCallId)
						pending({answer: outputToAnswer(part.output), wasFreeform: true})
					}
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history),
				reset: Effect.gen(function* () {
					yield* SubscriptionRef.set(history, [])
					yield* SubscriptionRef.set(events, undefined)
					yield* Ref.set(sessionRef, undefined)
					pendingApprovals.clear()
					pendingQuestions.clear()
				})
			}
		})
	)
}
