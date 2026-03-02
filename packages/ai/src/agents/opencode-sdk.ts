import {Deferred, Effect, Layer, Predicate, pipe, Queue, Ref, Stream, SubscriptionRef} from 'effect'

import {createOpencode, type Event, type OpencodeClient} from '@opencode-ai/sdk/v2'

import type {ModelId, ModelSelection, ProviderId} from '../catalog.ts'
import type {ConversationMessage, MessageStreamPart} from '../schema.ts'
import {
	AiError,
	applyPartsStream,
	ErrorPart,
	FilePart,
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
	client: OpencodeClient,
	selection: ModelSelection,
	sessionId: string,
	promptParts: Parameters<OpencodeClient['session']['promptAsync']>[0]['parts'] | undefined,
	pendingApprovals: Ref.Ref<Map<string, string>>,
	pendingQuestions: Ref.Ref<Map<string, string>>
) {
	return Stream.callback<MessageStreamPart, AiError>(
		Effect.fnUntraced(function* (queue) {
			const usage = yield* Ref.make({input: 0, output: 0, reasoning: 0})
			const textByPartId = new Map<string, string>()
			const reasoningByPartId = new Map<string, string>()
			const seenToolCalls = new Set<string>()
			const seenToolResults = new Set<string>()
			const seenToolErrors = new Set<string>()
			const finished = yield* Deferred.make<void>()
			const done = yield* Ref.make(false)
			const abort = new AbortController()

			const finish = Effect.fnUntraced(function* (
				finishReason: 'stop' | 'tool-calls' | 'error' | 'other',
				error: unknown
			) {
				const isDone = yield* Ref.get(done)
				if (isDone) return
				yield* Ref.set(done, true)
				if (Predicate.isNotUndefined(error)) yield* Queue.offer(queue, new ErrorPart({error}))
				yield* Queue.offer(queue, new FinishPart({finishReason, usage: yield* Ref.get(usage)}))
				yield* Queue.end(queue)
				yield* Deferred.succeed(finished, undefined)
			})

			const onEvent = Effect.fnUntraced(function* (event: Event) {
				switch (event.type) {
					case 'message.updated': {
						const info = event.properties.info
						if (info.role !== 'assistant') return
						yield* Ref.set(usage, {
							input: info.tokens.input,
							output: info.tokens.output,
							reasoning: info.tokens.reasoning
						})
						if (Predicate.isNotUndefined(info.error)) {
							yield* finish('error', info.error)
						}
						return
					}
					case 'message.part.updated': {
						const part = event.properties.part

						if ((part.type === 'text' && part.ignored !== true) || part.type === 'reasoning') {
							const byPartId = part.type === 'text' ? textByPartId : reasoningByPartId
							const previous = byPartId.get(part.id) ?? ''
							const delta = part.text.startsWith(previous) ? part.text.slice(previous.length) : part.text
							byPartId.set(part.id, part.text)
							if (delta.length > 0) {
								yield* Queue.offer(
									queue,
									part.type === 'text'
										? new TextPart({id: part.id, text: delta})
										: new ReasoningPart({id: part.id, text: delta})
								)
							}
							return
						}

						if (part.type === 'file') {
							const separator = part.url.indexOf(',')
							if (!part.url.startsWith('data:') || separator === -1) return
							yield* Queue.offer(
								queue,
								new FilePart({
									data: part.url.slice(separator + 1),
									mediaType: part.mime,
									filename: part.filename ?? 'attachment'
								})
							)
							return
						}

						if (part.type !== 'tool') return

						const status = part.state.status
						if (status === 'pending') return

						if (!seenToolCalls.has(part.callID)) {
							seenToolCalls.add(part.callID)
							yield* Queue.offer(
								queue,
								new ToolCallPart({toolCallId: part.callID, toolName: part.tool, input: part.state.input})
							)
						}

						if (status === 'running') {
							return
						}

						if (status === 'completed' && !seenToolResults.has(part.callID)) {
							seenToolResults.add(part.callID)
							yield* Queue.offer(
								queue,
								new ToolResultPart({toolCallId: part.callID, toolName: part.tool, output: part.state.output})
							)
							return
						}

						if (status === 'error' && !seenToolErrors.has(part.callID)) {
							seenToolErrors.add(part.callID)
							yield* Queue.offer(
								queue,
								new ToolErrorPart({toolCallId: part.callID, toolName: part.tool, error: part.state.error})
							)
						}
						return
					}
					case 'permission.asked': {
						const toolCallId = event.properties.tool?.callID ?? event.properties.id
						const part = new ToolApprovalRequestPart({approvalId: event.properties.id, toolCallId})
						yield* Ref.update(pendingApprovals, map => new Map(map).set(part.approvalId, event.properties.id))
						yield* Queue.offer(queue, part)
						yield* finish('tool-calls', undefined)
						return
					}
					case 'question.asked': {
						const toolCallId = event.properties.tool?.callID ?? event.properties.id
						yield* Ref.update(pendingQuestions, map => new Map(map).set(toolCallId, event.properties.id))
						yield* Queue.offer(
							queue,
							new ToolCallPart({
								toolCallId,
								toolName: 'question',
								input: {questions: event.properties.questions}
							})
						)
						yield* finish('tool-calls', undefined)
						return
					}
					case 'session.error':
						yield* finish('error', event.properties.error)
						return
					case 'session.idle':
						yield* finish('stop', undefined)
						return
					default:
						return
				}
			})

			yield* Queue.offer(queue, new StartPart({model: selection, role: 'assistant'}))

			const events = yield* Effect.tryPromise({
				try: () => client.event.subscribe(undefined, {signal: abort.signal}),
				catch: cause => new AiError({cause})
			})

			if (Predicate.isNotUndefined(promptParts)) {
				yield* Effect.tryPromise({
					try: () => {
						return client.session.promptAsync(
							{
								sessionID: sessionId,
								model: {providerID: selection.provider, modelID: selection.model},
								parts: promptParts,
								tools: {websearch: true, question: true}
							},
							{throwOnError: true}
						)
					},
					catch: cause => new AiError({cause})
				})
			}

			yield* Effect.raceFirst(
				pipe(
					Stream.fromAsyncIterable<Event, AiError>(events.stream, cause => new AiError({cause})),
					Stream.mapEffect(onEvent),
					Stream.runDrain
				),
				Deferred.await(finished)
			)

			const isDone = yield* Ref.get(done)
			if (!isDone) yield* finish('other', undefined)

			abort.abort()
		})
	)
}

export function OpencodeSdkAgentLayer(input: {provider: ProviderId; model: ModelId}) {
	return Layer.effect(
		Agent,
		Effect.fnUntraced(function* () {
			const selection: ModelSelection = {agent: 'opencode', provider: input.provider, model: input.model}
			const opencode = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: () => createOpencode({hostname: '127.0.0.1', port: 0}),
					catch: cause => new AiError({cause})
				}),
				opencode => Effect.sync(() => opencode.server.close())
			)
			const client = opencode.client
			const created = yield* Effect.tryPromise({
				try: () => client.session.create({}, {throwOnError: true}),
				catch: cause => new AiError({cause})
			})
			const sessionId = created.data.id

			const events = yield* SubscriptionRef.make<MessageStreamPart | undefined>(undefined)
			const history = yield* SubscriptionRef.make<ConversationMessage[]>([])
			const pendingApprovals = yield* Ref.make(new Map<string, string>())
			const pendingQuestions = yield* Ref.make(new Map<string, string>())

			const runAssistant = Effect.fnUntraced(function* (
				parts: Parameters<OpencodeClient['session']['promptAsync']>[0]['parts']
			) {
				yield* applyPartsStream(
					events,
					history,
					assistantStream(client, selection, sessionId, parts, pendingApprovals, pendingQuestions)
				)
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
					yield* runAssistant(
						parts.map(part => {
							if (part._tag === 'text') {
								return {type: 'text' as const, text: part.text}
							}
							return {
								type: 'file' as const,
								mime: part.mediaType,
								filename: part.filename,
								url: `data:${part.mediaType};base64,${part.data}`
							}
						})
					)
				}),
				respond: Effect.fnUntraced(function* (part) {
					yield* applyPartsStream(events, history, Stream.fromIterable([part]))

					if (part._tag === 'tool-approval-response') {
						const requestId = yield* Ref.modify(pendingApprovals, map => {
							const next = new Map(map)
							const value = next.get(part.approvalId)
							next.delete(part.approvalId)
							return [value, next] as const
						})
						if (Predicate.isUndefined(requestId)) return
						yield* Effect.tryPromise({
							try: () =>
								client.permission.reply(
									{requestID: requestId, reply: part.approved ? 'once' : 'reject'},
									{throwOnError: true}
								),
							catch: cause => new AiError({cause})
						})
						yield* runAssistant(undefined)
						return
					}

					const requestId = yield* Ref.modify(pendingQuestions, map => {
						const next = new Map(map)
						const value = next.get(part.toolCallId)
						next.delete(part.toolCallId)
						return [value, next] as const
					})
					if (Predicate.isUndefined(requestId)) return
					yield* Effect.tryPromise({
						try: () =>
							client.question.reply(
								{
									requestID: requestId,
									answers: [[Predicate.isString(part.output) ? part.output : JSON.stringify(part.output)]]
								},
								{throwOnError: true}
							),
						catch: cause => new AiError({cause})
					})
					yield* runAssistant(undefined)
				}),
				stream: pipe(SubscriptionRef.changes(events), Stream.filter(Predicate.isNotUndefined)),
				history: SubscriptionRef.changes(history)
			})
		})()
	)
}
