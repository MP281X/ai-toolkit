import {Duration, Effect, RcMap, Stream, SubscriptionRef} from 'effect'

import {Session} from '@ai-toolkit/oauth/server'

import {SessionId, SessionItem, SessionsContracts, UserId} from '#rpcs/sessions/contracts.ts'

export const userSessions = RcMap.make({
	lookup: (_userId: UserId) => SubscriptionRef.make<SessionItem[]>([]),
	idleTimeToLive: Duration.minutes(5)
})

export const SessionsLive = SessionsContracts.toLayer(
	Effect.gen(function* () {
		const sessionsMap = yield* userSessions

		return SessionsContracts.of({
			'sessions.list': Effect.fnUntraced(function* () {
				const ref = yield* RcMap.get(sessionsMap, UserId.make(yield* Session.userId))
				return ref.changes
			}, Stream.unwrapScoped),
			'sessions.add': Effect.fnUntraced(function* ({name, sessionId}) {
				const ref = yield* RcMap.get(sessionsMap, UserId.make(yield* Session.userId))
				const id = sessionId ? sessionId : SessionId.make(crypto.randomUUID())
				yield* SubscriptionRef.update(ref, sessions => [...sessions, new SessionItem({id, name})])
			}, Effect.scoped),
			'sessions.remove': Effect.fnUntraced(function* ({sessionId}) {
				const ref = yield* RcMap.get(sessionsMap, UserId.make(yield* Session.userId))
				yield* SubscriptionRef.update(ref, sessions => sessions.filter(s => s.id !== sessionId))
			}, Effect.scoped)
		})
	})
)
