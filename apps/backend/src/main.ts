import { Effect } from 'effect'
import { Runtime } from '#lib/runtime.ts'

await Runtime.runPromise(
	Effect.gen(function* () {
		yield* Effect.log('backend')
	})
)
