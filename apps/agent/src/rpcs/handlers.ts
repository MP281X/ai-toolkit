import {Array, Effect, FiberHandle, Predicate, pipe, RcMap, Stream, SubscriptionRef} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import type {AgentToolKit} from '@ai-toolkit/ai/tools'
import {makeResumableStream} from '@ai-toolkit/ai/utils'
import type {AiError, Prompt, Response} from 'effect/unstable/ai'

import {RpcContracts, Session, Workspace} from '#rpcs/contracts.ts'

const conversationRcMap = RcMap.make({
	lookup: Effect.fnUntraced(function* (_sessionId: string) {
		type AgentPart = Response.StreamPart<typeof AgentToolKit.tools>

		const agent = yield* Agent
		const handle = yield* FiberHandle.make<void, AiError.AiError>()
		const resumable = yield* makeResumableStream<Prompt.Message | AgentPart>()

		return {
			prompt: Effect.fnUntraced(function* (messages: Prompt.Message[]) {
				yield* Effect.forEach(messages, resumable.append)
				yield* FiberHandle.run(handle, pipe(agent.streamText(messages), Stream.tap(resumable.append), Stream.runDrain))
			}, Effect.asVoid),
			stop: FiberHandle.clear(handle),
			stream: resumable.stream
		}
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const workspacesRef = yield* SubscriptionRef.make(Array.empty<Workspace>())
		const sessionsRef = yield* SubscriptionRef.make(Array.empty<Session>())
		const rcMap = yield* conversationRcMap

		return RpcContracts.of({
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				const conversation = yield* RcMap.get(rcMap, payload.sessionId)
				yield* conversation.prompt([payload.message])
			}),
			'agent.stop': Effect.fnUntraced(function* (payload) {
				const conversation = yield* RcMap.get(rcMap, payload.sessionId)
				yield* conversation.stop
			}),
			'agent.events': payload => Stream.unwrap(Effect.map(RcMap.get(rcMap, payload.sessionId), c => c.stream)),
			'agent.workspaces': () => SubscriptionRef.changes(workspacesRef),
			'agent.sessions': () => SubscriptionRef.changes(sessionsRef),
			'agent.createWorkspace': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(workspacesRef, current =>
					Array.append(current, new Workspace({name: payload.name, parentId: payload.parentId}))
				)
			}),
			'agent.updateWorkspace': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(workspacesRef, current =>
					Array.map(current, ws =>
						ws.id === payload.id
							? new Workspace({
									id: ws.id,
									name: payload.name ?? ws.name,
									parentId: Predicate.isUndefined(payload.parentId) ? ws.parentId : payload.parentId
								})
							: ws
					)
				)
			}),
			'agent.deleteWorkspace': Effect.fnUntraced(function* (payload) {
				const all = yield* SubscriptionRef.get(workspacesRef)
				const idsToDelete = new Set<string>([payload.id])
				let changed = true
				while (changed) {
					changed = false
					for (const ws of all) {
						if (Predicate.isNotNull(ws.parentId) && idsToDelete.has(ws.parentId) && !idsToDelete.has(ws.id)) {
							idsToDelete.add(ws.id)
							changed = true
						}
					}
				}
				yield* SubscriptionRef.update(sessionsRef, current =>
					Array.filter(current, s => !idsToDelete.has(s.workspaceId))
				)
				yield* SubscriptionRef.update(workspacesRef, current => Array.filter(current, ws => !idsToDelete.has(ws.id)))
			}),
			'agent.createSession': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(sessionsRef, current =>
					Array.append(current, new Session({id: payload.id, workspaceId: payload.workspaceId, title: 'New chat'}))
				)
			}),
			'agent.updateSession': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(sessionsRef, current =>
					Array.map(current, s =>
						s.id === payload.id
							? new Session({id: s.id, workspaceId: s.workspaceId, title: payload.title ?? s.title})
							: s
					)
				)
			}),
			'agent.deleteSession': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(sessionsRef, current => Array.filter(current, s => s.id !== payload.id))
			})
		})
	})
)
