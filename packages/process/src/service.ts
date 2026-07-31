import {
	Array,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
	Ref,
	Scope,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {ManagedProcessError} from './schema.ts'

export declare namespace ManagedProcess {
	export type Config = {
		readonly cwd: string
		readonly command: readonly [string, ...string[]]
		readonly port?: number
		readonly logLimit?: number
	}
}

function cleanLine(line: string) {
	return pipe(line, String.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, ''), String.trim)
}

export class ManagedProcess extends Context.Service<ManagedProcess>()('@deslop/process/service/ManagedProcess', {
	make: Effect.fnUntraced(function* (config: ManagedProcess.Config) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const processScope = yield* Effect.scope
		const status = yield* SubscriptionRef.make<'stopped' | 'starting' | 'running'>('stopped')
		const logs = yield* SubscriptionRef.make<readonly string[]>([])
		const handle = yield* Ref.make<Option.Option<ChildProcessSpawner.ChildProcessHandle>>(Option.none())
		const lifecycle = yield* Semaphore.make(1)
		const limit = config.logLimit ?? 500

		const append = Effect.fnUntraced(function* (line: string) {
			const cleaned = cleanLine(line)
			if (cleaned === '') return
			yield* SubscriptionRef.update(logs, current => pipe(current, Array.append(cleaned), Array.takeRight(limit)))
		})

		const stop = Effect.fn('ManagedProcess.stop')(function* () {
			const current = yield* Ref.get(handle)
			if (Option.isSome(current)) {
				yield* pipe(
					current.value.kill(),
					Effect.mapError(cause => ManagedProcessError.make({cause, message: 'failed to stop process'}))
				)
				yield* Ref.set(handle, Option.none())
			}
			yield* SubscriptionRef.set(status, 'stopped')
		})

		const start = Effect.fn('ManagedProcess.start')(function* () {
			if (Option.isSome(yield* Ref.get(handle))) return
			yield* SubscriptionRef.set(status, 'starting')
			const [command, ...args] = config.command
			const child = yield* spawner
				.spawn(
					ChildProcess.make(command, args, {
						cwd: config.cwd,
						env: Predicate.isUndefined(config.port) ? undefined : {PORT: `${config.port}`},
						extendEnv: true,
						stderr: 'pipe',
						stdout: 'pipe'
					})
				)
				.pipe(
					Effect.provideService(Scope.Scope, processScope),
					Effect.mapError(cause => ManagedProcessError.make({cause, message: 'failed to start process'})),
					Effect.tapError(() => SubscriptionRef.set(status, 'stopped'))
				)
			yield* Ref.set(handle, Option.some(child))
			yield* SubscriptionRef.set(status, 'running')
			yield* pipe(
				child.all,
				Stream.decodeText,
				Stream.splitLines,
				Stream.runForEach(append),
				Effect.catch(error => append(error.message)),
				Effect.forkIn(processScope)
			)
			yield* pipe(
				child.exitCode,
				Effect.matchEffect({
					onFailure: cause => append(`process exit failed: ${cause.message}`),
					onSuccess: () => Effect.void
				}),
				Effect.andThen(
					Ref.modify(handle, current =>
						Option.isSome(current) && current.value === child ? [true, Option.none()] : [false, current]
					)
				),
				Effect.flatMap(owned => (owned ? SubscriptionRef.set(status, 'stopped') : Effect.void)),
				Effect.forkIn(processScope)
			)
		})

		yield* Effect.addFinalizer(() => pipe(stop(), Effect.ignore, Semaphore.withPermit(lifecycle)))

		return {
			logs,
			port: config.port,
			start: pipe(start(), Semaphore.withPermit(lifecycle)),
			status,
			stop: pipe(stop(), Semaphore.withPermit(lifecycle))
		}
	})
}) {
	public static layer = (config: ManagedProcess.Config) => Layer.effect(this, this.make(config))
}
