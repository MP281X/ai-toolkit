import { AiClient } from '@ai-toolkit/ai'
import { Effect } from 'effect'
import { AiRpcs } from './contracts.ts'

export const AiHandlers = AiRpcs.toLayer(
	Effect.gen(function* () {
		const ai = yield* AiClient
		return AiRpcs.of({
			'ai.stream': () => ai.stream()
		})
	})
)
