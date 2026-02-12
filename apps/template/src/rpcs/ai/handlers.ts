import {Duration, Effect, pipe, RcMap, Stream, SubscriptionRef} from 'effect'

import {type Message, streamToMessage} from '@ai-toolkit/ai/schema'
import {AiSdk} from '@ai-toolkit/ai/service'
import {Session} from '@ai-toolkit/oauth/server'

import {AiContracts} from '#rpcs/ai/contracts.ts'
import {type SessionId, SessionItem, UserId} from '#rpcs/sessions/contracts.ts'
import {userSessions} from '#rpcs/sessions/handlers.ts'

const messageSessions = RcMap.make({
	lookup: (_sessionId: SessionId) => SubscriptionRef.make<Message[]>([]),
	idleTimeToLive: Duration.minutes(5)
})

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk
		const msgsMap = yield* messageSessions
		const sessionsMap = yield* userSessions

		return AiContracts.of({
			'ai.listMessages': Effect.fnUntraced(function* ({sessionId}) {
				const session = yield* RcMap.get(msgsMap, sessionId)
				return session.changes
			}, Stream.unwrapScoped),
			'ai.sendMessage': Effect.fnUntraced(function* ({sessionId, prompt, model}) {
				const userId = yield* Session.userId
				const sessionsRef = yield* RcMap.get(sessionsMap, UserId.make(userId))

				yield* SubscriptionRef.update(sessionsRef, sessions => {
					if (sessions.some(s => s.id === sessionId)) return sessions
					return [...sessions, new SessionItem({id: sessionId, name: 'New Session'})]
				})

				const msgSession = yield* RcMap.get(msgsMap, sessionId)

				yield* pipe(
					aiSdk.stream({prompt, model}),
					streamToMessage,
					Stream.flatMap(message => SubscriptionRef.update(msgSession, () => [message])),
					Stream.runDrain
				)

				return sessionId
			}, Effect.scoped)
		})
	})
)
