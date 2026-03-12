import {Effect} from 'effect'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		return AiContracts.of({
			//
		})
	})
)
