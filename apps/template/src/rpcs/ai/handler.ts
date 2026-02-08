import {Effect} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'

import {AiRpcs} from '#rpcs/ai/contracts.ts'

export const AiLive = AiRpcs.toLayer(
	Effect.gen(function* () {
		const aiSdk = yield* AiSdk

		return AiRpcs.of({
			AiStream: args => aiSdk.stream(args)
		})
	})
)
