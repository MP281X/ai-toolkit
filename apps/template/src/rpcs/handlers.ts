import {Effect, SubscriptionRef} from 'effect'

import type {Message} from '@ai-toolkit/ai'
import {AiSdk} from '@ai-toolkit/ai'

import {AiRpcs, MessagesRpcs} from '#rpcs/contracts.ts'

export const AiLive = AiRpcs.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk

		return AiRpcs.of({
			AiStream: args => aiSdk.stream(args)
		})
	})
)

export const MessagesLive = MessagesRpcs.toLayer(
	Effect.gen(function* () {
		const ref = yield* SubscriptionRef.make<readonly Message[]>([])

		return MessagesRpcs.of({
			ListMessages: () => ref.changes
		})
	})
)
