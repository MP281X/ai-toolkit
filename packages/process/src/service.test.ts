import {setTimeout as delay} from 'node:timers/promises'

import {NodeServices} from '@effect/platform-node'
import {assert, describe, it} from '@effect/vitest'

import {Effect, SubscriptionRef} from 'effect'

import {ManagedProcess} from './service.ts'

describe('ManagedProcess', () => {
	it.effect('keeps output and exit observers alive after the start call completes', () =>
		Effect.gen(function* () {
			const process = yield* ManagedProcess.make({
				command: ['/bin/sh', '-c', "printf 'managed output\\n'"],
				cwd: '/tmp'
			})
			yield* Effect.scoped(process.start).pipe(Effect.timeout('1 second'))
			yield* Effect.promise(() => delay(500))

			assert.include(yield* SubscriptionRef.get(process.logs), 'managed output')
			assert.strictEqual(yield* SubscriptionRef.get(process.status), 'stopped')
			yield* process.stop.pipe(Effect.timeout('1 second'))
		}).pipe(Effect.provide(NodeServices.layer))
	)
})
