import {Effect, SubscriptionRef} from 'effect'

import {Message, ReasoningDelta, TextDelta} from '@ai-toolkit/ai/schema'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		// const aiSdk = yield* AiSdk
		const messages = yield* SubscriptionRef.make([
			Message.make({
				model: {model: 'glm-4.7-free', provider: 'opencode_zen'},
				startedAt: 0,
				role: 'assistant',
				parts: [
					TextDelta.make({id: '000', text: 'ciao'}),
					ReasoningDelta.make({id: '000', text: 'ciao2'}),
					TextDelta.make({id: '111', text: 'ciao3'})
				]
			})
		])

		return AiContracts.of({
			'ai.listMessages': () => messages.changes
		})
	})
)
