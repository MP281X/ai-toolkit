import {Effect} from 'effect'

import {AiClient} from '@ai-toolkit/ai'

import {AiRpcs} from './contracts.ts'

export const AiHandlers = AiRpcs.toLayer(
	Effect.gen(function* () {
		const ai = yield* AiClient
		return AiRpcs.of({
			'ai.stream': () => ai.stream()
		})
	})
)
