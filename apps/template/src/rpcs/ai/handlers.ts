import {Duration, Effect, pipe, RcMap, Stream, SubscriptionRef} from 'effect'

import {type Message, streamToMessage} from '@ai-toolkit/ai/schema'
import {AiSdk} from '@ai-toolkit/ai/service'

import {AiContracts, type SessionId} from '#rpcs/ai/contracts.ts'

const sessions = RcMap.make({
	lookup: (_sessionId: SessionId) => SubscriptionRef.make<Message[]>([]),
	idleTimeToLive: Duration.minutes(5)
})

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk
		const sessionsMap = yield* sessions

		return AiContracts.of({
			'ai.listMessages': Effect.fnUntraced(function* ({sessionId}) {
				const session = yield* RcMap.get(sessionsMap, sessionId)
				return session.changes
			}, Stream.unwrapScoped),
			'ai.sendMessage': Effect.fnUntraced(function* ({sessionId, prompt, model}) {
				const session = yield* RcMap.get(sessionsMap, sessionId)

				yield* pipe(
					aiSdk.stream({prompt, model}),
					streamToMessage,
					Stream.flatMap(message => SubscriptionRef.update(session, () => [message])),
					Stream.runDrain
				)
			}, Effect.scoped)
		})
	})
)
