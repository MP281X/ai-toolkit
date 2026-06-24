import {Context, Effect, Layer, Schedule, Stream, SubscriptionRef, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {OsError, Resources} from './schema.ts'
import {cpuTimes, cpuUtilization, darwinMemoryUtilization, nodeProcessUsage, osMemoryUtilization} from './system.ts'

export class Os extends Context.Service<Os>()('@deslop/os/service/Os', {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

		const commandOutput = Effect.fn('Os.commandOutput')(function* (command: string, args: readonly string[]) {
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* spawner.spawn(ChildProcess.make(command, args, {stderr: 'pipe', stdout: 'pipe'}))
					const stdout = yield* pipe(
						Stream.decodeText(handle.stdout),
						Stream.mkString,
						Effect.orElseSucceed(() => '')
					)
					const exitCode = yield* handle.exitCode
					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new OsError({message: `${command} exited with ${exitCode}`})
					}
					return stdout
				})
			)
		})

		const memoryUtilization =
			process.platform === 'darwin'
				? pipe(
						Effect.all(
							{
								memsizeOutput: commandOutput('sysctl', ['-n', 'hw.memsize']),
								vmStatOutput: commandOutput('vm_stat', [])
							},
							{concurrency: 2}
						),
						Effect.map(darwinMemoryUtilization),
						Effect.catch(() => osMemoryUtilization)
					)
				: osMemoryUtilization

		const loadResources = pipe(
			Effect.gen(function* () {
				const before = yield* cpuTimes()
				yield* Effect.sleep('250 millis')
				const after = yield* cpuTimes()
				return Resources.make({
					cpu: cpuUtilization({after, before}),
					memory: yield* memoryUtilization,
					nodeHeap: nodeProcessUsage().heapUtilization
				})
			}),
			Effect.mapError(cause => new OsError({cause})),
			Effect.withSpan('Os.resources.load')
		)

		const resources = yield* SubscriptionRef.make(yield* loadResources)
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
