import {Effect, SubscriptionRef} from 'effect'

import type {Message} from '@ai-toolkit/ai/schema'

import {MessagesRpcs} from '#rpcs/messages/contracts.ts'

export const MessagesLive = MessagesRpcs.toLayer(
	Effect.gen(function* () {
		const ref = yield* SubscriptionRef.make<readonly Message[]>([])

		return MessagesRpcs.of({
			ListMessages: () => ref.changes
		})
	})
)
