// import { AiClient } from '@ai-toolkit/ai/ai-sdk'
// import { Effect, pipe, Stream } from 'effect'

import { Effect } from 'effect'
import { Runtime } from '#lib/runtime.ts'

// await Runtime.runPromise(
// 	Effect.gen(function* () {
// 		const ai = yield* AiClient
//
// 		yield* pipe(ai.stream(), Stream.tap(Effect.log), Stream.runDrain)
// 	})
// )
//
await Runtime.runPromise(Effect.log('backend'))
