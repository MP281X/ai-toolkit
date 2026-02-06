import {Effect, Stream} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'

import {AiRpcs} from '#rpcs/contracts.ts'

export const AiLive = AiRpcs.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk

		return AiRpcs.of({
			AiStream: args => Stream.flatten(aiSdk.stream(args))
		})
	})
)
