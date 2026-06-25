import {Context, Effect, Layer, Schedule, Stream, SubscriptionRef, pipe} from 'effect'

import {OsError, Resources} from './schema.ts'
import {cpuTimes, cpuUtilization, nodeProcessUsage, osMemoryUtilization} from './system.ts'

export class Os extends Context.Service<Os>()('@deslop/os/service/Os', {
	make: Effect.gen(function* () {
		const loadResources = pipe(
			Effect.gen(function* () {
				const before = yield* cpuTimes()
				yield* Effect.sleep('250 millis')
				const after = yield* cpuTimes()
				return Resources.make({
					cpu: cpuUtilization({after, before}),
					memory: yield* osMemoryUtilization,
					nodeHeap: nodeProcessUsage().heapUtilization
				})
			}),
			Effect.mapError(cause => new OsError({cause})),
			Effect.withSpan('Os.resources.load')
		)

		const resources = yield* SubscriptionRef.make(
			Resources.make({cpu: 0, memory: yield* osMemoryUtilization, nodeHeap: nodeProcessUsage().heapUtilization})
		)
		yield* pipe(
			Stream.fromEffect(loadResources),
			Stream.repeat(Schedule.spaced('10 seconds')),
			Stream.runForEach(value => SubscriptionRef.set(resources, value)),
			Effect.forkScoped
		)

		return {resources}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
