import type {Scope} from 'effect'
import {
	Array,
	Deferred,
	Effect,
	flow,
	Layer,
	MutableHashMap,
	Option,
	Predicate,
	pipe,
	Queue,
	Ref,
	Stream,
	SubscriptionRef
} from 'effect'

import {CopilotClient, type PermissionRequestResult, type SessionEvent} from '@github/copilot-sdk'

import type {ModelId, ModelSelection} from '../catalog.ts'
import type {ConversationMessage, MessageStreamPart} from '../schema.ts'
import {
	AiError,
	applyPartsStream,
	ErrorPart,
	FinishPart,
	ReasoningPart,
	StartPart,
	TextPart,
	ToolApprovalRequestPart,
	ToolCallPart,
	ToolErrorPart,
	ToolResultPart
} from '../schema.ts'
import {Agent} from '../service.ts'

function assistantStream(
	session: Awaited<ReturnType<CopilotClient['createSession']>>,
	selection: ModelSelection,
	prompt: string
) {
	return Stream.callback<MessageStreamPart, AiError>(
		Effect.fnUntraced(function* (queue) {
			const usage = yield* Ref.make({input: 0, output: 0, reasoning: 0})
			const toolNames = MutableHashMap.empty<string, string>()
			const runFork = Effect.runForkWith(yield* Effect.services<Scope.Scope>())

			const onEvent = Effect.fnUntraced(function* (event: SessionEvent) {
				switch (event.type) {
					case 'assistant.turn_start':
						return yield* Queue.offer(queue, new StartPart({model: selection, role: 'assistant'}))
					case 'assistant.message_delta':
						return yield* Queue.offer(queue, new TextPart({id: event.data.messageId, text: event.data.deltaContent}))
					case 'assistant.reasoning_delta':
						return yield* Queue.offer(
							queue,
							new ReasoningPart({id: event.data.reasoningId, text: event.data.deltaContent})
						)
					case 'tool.execution_start':
						MutableHashMap.set(toolNames, event.data.toolCallId, event.data.toolName)
						return yield* Queue.offer(
							queue,
							new ToolCallPart({
								toolCallId: event.data.toolCallId,
								toolName: event.data.toolName,
								input: event.data.arguments
							})
						)
					case 'tool.execution_complete': {
						const toolName = Option.getOrElse(MutableHashMap.get(toolNames, event.data.toolCallId), () => 'tool')
						if (event.data.success) {
							const output =
								event.data.result?.detailedContent ??
								event.data.result?.content ??
								event.data.result?.contents ??
								event.data.result ??
								null
							return yield* Queue.offer(
								queue,
								new ToolResultPart({toolCallId: event.data.toolCallId, toolName, output})
							)
						}
						return yield* Queue.offer(
							queue,
							new ToolErrorPart({toolCallId: event.data.toolCallId, toolName, error: event.data.error})
						)
					}
					case 'assistant.usage':
						yield* Ref.update(usage, u => ({
							input: u.input + (event.data.inputTokens ?? 0),
							output: u.output + (event.data.outputTokens ?? 0),
							reasoning: u.reasoning
						}))
						return
					case 'assistant.turn_end':
						return yield* Queue.offer(queue, new FinishPart({finishReason: 'stop', usage: yield* Ref.get(usage)}))
					case 'session.error':
						yield* Queue.offer(queue, new ErrorPart({error: new Error(event.data.message)}))
						yield* Queue.offer(queue, new FinishPart({finishReason: 'error', usage: yield* Ref.get(usage)}))
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

export function CopilotSdkAgentLayer(input: {model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'copilot', provider: 'copilot', model: input.model}
			const client = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: async () => {
						const client = new CopilotClient({logLevel: 'error'})
						await client.start()
						return client
					},
					catch: cause => new AiError({cause})
				}),
				flow(
					client => Effect.tryPromise({try: () => client.stop(), catch: cause => new AiError({cause})}),
					Effect.ignore
				)
			)

			const events = yield* SubscriptionRef.make<MessageStreamPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<ConversationMessage[]>([])
			const pendingApprovals = MutableHashMap.empty<string, Deferred.Deferred<PermissionRequestResult>>()
			const pendingQuestions = MutableHashMap.empty<string, Deferred.Deferred<{answer: string; wasFreeform: boolean}>>()

			const runPromise = Effect.runPromiseWith(yield* Effect.services<Scope.Scope>())

			const session = yield* Effect.tryPromise({
				try: () =>
					client.createSession({
						model: selection.model,
						streaming: true,
						onPermissionRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const part = new ToolApprovalRequestPart({toolCallId: request.toolCallId})
									const deferred = yield* Deferred.make<PermissionRequestResult>()
									MutableHashMap.set(pendingApprovals, part.approvalId, deferred)
									yield* applyPartsStream(
										events,
										history,
										Stream.fromIterable([
											new StartPart({model: selection, role: 'assistant'}),
											part,
											new FinishPart({finishReason: 'tool-calls'})
										])
									)
									return yield* Deferred.await(deferred)
								})
							),
						onUserInputRequest: request =>
							runPromise(
								Effect.gen(function* () {
									const part = new ToolCallPart({
										toolName: 'question',
										input: {
											questions: [
												{
													header: 'Question',
													question: request.question,
													options: pipe(
														request.choices ?? [],
														Array.map(choice => ({label: choice}))
													)
												}
											]
										}
									})
									const deferred = yield* Deferred.make<{answer: string; wasFreeform: boolean}>()
									MutableHashMap.set(pendingQuestions, part.toolCallId, deferred)
									yield* applyPartsStream(events, history, Stream.fromIterable([part]))
									return yield* Deferred.await(deferred)
								})
							)
					}),
				catch: cause => new AiError({cause})
			})

			return Agent.of({
				prompt: Effect.fnUntraced(function* (parts) {
					yield* applyPartsStream(
						events,
						history,
						Stream.fromIterable([
							new StartPart({model: selection, role: 'user'}),
							...parts,
							new FinishPart({finishReason: 'stop'})
						])
					)
					yield* applyPartsStream(
						events,
						history,
						assistantStream(
							session,
							selection,
							pipe(
								parts,
								Array.filter(part => part._tag === 'text'),
								Array.map(part => part.text),
								Array.join('\n')
							)
						)
					)
				}),
				respond: Effect.fnUntraced(function* (part) {
					yield* applyPartsStream(events, history, Stream.fromIterable([part]))

					if (part._tag === 'tool-approval-response') {
						const deferred = MutableHashMap.get(pendingApprovals, part.approvalId)
						MutableHashMap.remove(pendingApprovals, part.approvalId)
						if (Option.isSome(deferred)) {
							yield* Deferred.succeed(
								deferred.value,
								part.approved ? {kind: 'approved'} : {kind: 'denied-interactively-by-user'}
							)
						}
						return
					}

					const deferred = MutableHashMap.get(pendingQuestions, part.toolCallId)
					MutableHashMap.remove(pendingQuestions, part.toolCallId)
					if (Option.isSome(deferred)) {
						yield* Deferred.succeed(deferred.value, {
							answer: Predicate.isString(part.output) ? part.output : JSON.stringify(part.output),
							wasFreeform: true
						})
					}
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history)
			})
		})()
	)
}
