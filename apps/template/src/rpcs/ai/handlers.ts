import {Effect, flow, Stream, SubscriptionRef} from 'effect'

import {type Message, streamToMessage} from '@ai-toolkit/ai/schema'
import {AiSdk} from '@ai-toolkit/ai/service'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk

		const messages = yield* SubscriptionRef.make<Message[]>([])

		return AiContracts.of({
			'ai.listMessages': () => messages.changes,
			'ai.sendMessage': flow(
				aiSdk.stream,
				streamToMessage,
				Stream.tap(message => SubscriptionRef.update(messages, () => [message])),
				Stream.runDrain
			)
		})
	})
)
