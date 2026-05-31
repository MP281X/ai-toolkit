import {
	Array,
	Config,
	Context,
	Deferred,
	Effect,
	Layer,
	Order,
	Option,
	PubSub,
	Queue,
	Ref,
	Schedule,
	Semaphore,
	Stream,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import type {IPty} from '@lydell/node-pty'
import {SerializeAddon} from '@xterm/addon-serialize'
import xtermHeadless from '@xterm/headless'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {TerminalEvent, TerminalStatus} from './schema.ts'
import {TerminalError} from './schema.ts'

function parseProcessParents(output: string) {
	const parents = new Map<number, number>()

	for (const line of output.split('\n')) {
		const columns = line.trim().split(/\s+/)
		const pid = Number(columns[0])
		const ppid = Number(columns[1])
		if (Number.isFinite(pid) && Number.isFinite(ppid)) parents.set(pid, ppid)
	}

	return parents
}

function parseListeningPorts(output: string) {
	const ports: {readonly pid: number; readonly port: number}[] = []

	for (const line of output.split('\n')) {
		const columns = line.trim().split(/\s+/)
		const port = Number(columns[3]?.match(/:(\d+)$/)?.[1])
		const pid = Number(line.match(/pid=(\d+)/)?.[1])

		if (Number.isFinite(port) && Number.isFinite(pid)) ports.push({pid, port})
	}

	return ports
}

function isDescendant(pid: number, ancestorPid: number, parents: ReadonlyMap<number, number>) {
	let current = pid
	const seen = new Set<number>()

	while (!seen.has(current)) {
		if (current === ancestorPid) return true
		seen.add(current)

		const parent = parents.get(current)
		if (!parent || parent === current) return false
		current = parent
	}

	return false
}

const commandString = Effect.fnUntraced(function* (command: string, args: readonly string[], message: string) {
	const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)

	return yield* pipe(
		execString(ChildProcess.make(command, args)),
		Effect.mapError(cause => new TerminalError({cause, message}))
	)
})

const readProcessParents = pipe(
	commandString('ps', ['-eo', 'pid=,ppid='], 'failed to list terminal processes'),
	Effect.map(parseProcessParents)
)

const readListeningPorts = pipe(
	commandString('ss', ['-H', '-ltnp'], 'failed to list terminal ports'),
	Effect.map(parseListeningPorts)
)

type TerminalControl = {readonly type: 'restart'} | {readonly type: 'stop'}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {
		readonly args?: readonly string[]
		readonly command?: string
		readonly cwd: string
		readonly restart?: 'always' | 'failed' | 'never'
	}) {
		const events = yield* PubSub.bounded<{readonly event: TerminalEvent; readonly sequence: number}>({capacity: 256})
		const controls = yield* Queue.unbounded<TerminalControl>()
		const dataQueue = yield* Queue.unbounded<string>()
		const portsRef = yield* SubscriptionRef.make<readonly number[]>([])
		const portOwners = yield* Ref.make<ReadonlyMap<number, number>>(new Map())
		const processRef = yield* Ref.make<IPty | undefined>(undefined)
		const screenLock = yield* Semaphore.make(1)
		const sequenceRef = yield* Ref.make(0)
		const sizeRef = yield* Ref.make({cols: 120, rows: 32})
		const statusRef = yield* SubscriptionRef.make<TerminalStatus>({state: 'starting'})
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command ?? shell
		const processArgs = config.args ?? []
		const restartPolicy = config.restart ?? (config.command ? 'never' : 'always')
		const screen = new xtermHeadless.Terminal({allowProposedApi: true, cols: 120, rows: 32, scrollback: 10_000})
		const serialize = new SerializeAddon()

		screen.loadAddon(serialize)

		const publish = Effect.fnUntraced(function* (event: TerminalEvent) {
			return yield* pipe(
				Ref.updateAndGet(sequenceRef, sequence => sequence + 1),
				Effect.flatMap(sequence => PubSub.publish(events, {event, sequence})),
				Effect.asVoid
			)
		})

		const requestSnapshot = Semaphore.withPermit(
			screenLock,
			Effect.gen(function* () {
				const data = serialize.serialize({scrollback: 10_000})
				const sequence = yield* Ref.get(sequenceRef)

				return {data, sequence}
			})
		)

		const resetScreen = Semaphore.withPermit(
			screenLock,
			pipe(
				Effect.sync(() => {
					screen.reset()
				}),
				Effect.andThen(publish({type: 'reset'}))
			)
		)

		const writeScreen = Effect.fnUntraced(function* (data: string) {
			return yield* Semaphore.withPermit(
				screenLock,
				pipe(
					Effect.callback<void>(resume => {
						screen.write(data, () => {
							resume(Effect.void)
						})
					}),
					Effect.andThen(publish({data, type: 'data'}))
				)
			)
		})

		yield* Effect.addFinalizer(() =>
			Effect.all([Queue.shutdown(controls), Queue.shutdown(dataQueue), PubSub.shutdown(events)], {discard: true})
		)

		yield* pipe(Stream.fromQueue(dataQueue), Stream.runForEach(writeScreen), Effect.forkScoped)

		const spawnProcess = Effect.acquireRelease(
			Effect.gen(function* () {
				const size = yield* Ref.get(sizeRef)
				const exited = yield* Deferred.make<{readonly exitCode: number; readonly signal?: number}>()
				let didExit = false
				const nodePty = yield* Effect.tryPromise({
					catch: cause => new TerminalError({cause, message: 'failed to load terminal process runtime'}),
					try: () => import('@lydell/node-pty')
				})
				const subprocess = yield* Effect.try({
					catch: cause => new TerminalError({cause, message: `failed to spawn terminal in ${config.cwd}`}),
					try: () =>
						nodePty.spawn(processCommand, [...processArgs], {
							cols: size.cols,
							cwd: config.cwd,
							env: {...process.env, TERM: 'xterm-256color'},
							name: 'xterm-256color',
							rows: size.rows
						})
				})
				const data = subprocess.onData(data => {
					Queue.offerUnsafe(dataQueue, data)
				})
				const exit = subprocess.onExit(event => {
					didExit = true
					Deferred.doneUnsafe(exited, Effect.succeed(event))
				})

				yield* Ref.set(processRef, subprocess)
				yield* SubscriptionRef.set(statusRef, {pid: subprocess.pid, state: 'running'})

				return {
					data,
					exit,
					exited,
					kill: () => {
						if (!didExit) subprocess.kill()
					},
					process: subprocess
				}
			}),
			subprocess =>
				Effect.gen(function* () {
					yield* Effect.sync(() => {
						subprocess.data.dispose()
						subprocess.exit.dispose()
						subprocess.kill()
					})
					yield* Ref.update(processRef, current => (current === subprocess.process ? undefined : current))
				})
		)

		yield* pipe(
			Effect.gen(function* () {
				let restart = true
				while (restart) {
					yield* resetScreen
					yield* SubscriptionRef.set(statusRef, {state: 'starting'})
					const action = yield* pipe(
						Effect.scoped(
							Effect.flatMap(spawnProcess, subprocess =>
								Effect.raceFirst(
									pipe(
										Deferred.await(subprocess.exited),
										Effect.map(event => ({event, type: 'exit'}) as const)
									),
									Queue.take(controls)
								)
							)
						),
						Effect.catch(error => Effect.succeed({error, type: 'error'} as const))
					)

					yield* Ref.set(portOwners, new Map())
					yield* SubscriptionRef.updateSome(portsRef, ports =>
						ports.length === 0 ? Option.none() : Option.some<readonly number[]>([])
					)

					if (action.type === 'stop') {
						yield* SubscriptionRef.set(statusRef, {state: 'stopped'})
						const control = yield* Queue.take(controls)
						restart = control.type === 'restart'
						if (restart) yield* Effect.sleep('250 millis')
						continue
					} else if (action.type === 'restart') {
						restart = true
					} else if (action.type === 'error') {
						yield* SubscriptionRef.set(statusRef, {state: 'failed'})
						restart = restartPolicy === 'always' || restartPolicy === 'failed'
					} else {
						const failed = action.event.exitCode !== 0
						yield* SubscriptionRef.set(statusRef, {state: failed ? 'failed' : 'exited'})
						restart = restartPolicy === 'always' || (restartPolicy === 'failed' && failed)
					}

					if (!restart) {
						const control = yield* Queue.take(controls)
						restart = control.type === 'restart'
					}

					if (restart) yield* Effect.sleep('250 millis')
				}
			}),
			Effect.forkScoped
		)

		yield* pipe(
			Effect.gen(function* () {
				const process = yield* Ref.get(processRef)
				if (!process?.pid) {
					yield* Ref.set(portOwners, new Map())
					yield* SubscriptionRef.updateSome(portsRef, ports =>
						ports.length === 0 ? Option.none() : Option.some<readonly number[]>([])
					)
					return
				}

				const [parents, listeningPorts] = yield* Effect.all([readProcessParents, readListeningPorts])
				const nextPortOwners = new Map<number, number>()
				const nextPorts = pipe(
					listeningPorts,
					Array.filter(port => isDescendant(port.pid, process.pid, parents)),
					Array.map(port => {
						nextPortOwners.set(port.port, port.pid)
						return port.port
					}),
					Array.dedupe,
					Array.sort(Order.Number)
				)

				yield* Ref.set(portOwners, nextPortOwners)
				yield* SubscriptionRef.updateSome(portsRef, currentPorts =>
					currentPorts.length === nextPorts.length && currentPorts.every((port, index) => port === nextPorts[index])
						? Option.none()
						: Option.some(nextPorts)
				)
			}),
			Effect.ignore,
			Effect.repeat(Schedule.spaced('1 second')),
			Effect.forkScoped
		)

		return {
			events: Stream.scoped(
				Stream.unwrap(
					Effect.gen(function* () {
						const subscription = yield* PubSub.subscribe(events)
						const snapshot = yield* requestSnapshot
						const pending = yield* PubSub.takeUpTo(subscription, Number.POSITIVE_INFINITY)
						const initialEvents = pending.filter(event => event.sequence > snapshot.sequence).map(event => event.event)

						return pipe(
							Stream.fromIterable([{data: snapshot.data, type: 'snapshot'} as const, ...initialEvents]),
							Stream.concat(Stream.fromEffectRepeat(PubSub.take(subscription)).pipe(Stream.map(event => event.event)))
						)
					})
				)
			),
			killPort: Effect.fnUntraced(function* (port: number) {
				const owners = yield* Ref.get(portOwners)
				const pid = owners.get(port)
				if (!pid) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: `failed to kill process on port ${port}`}),
					try: () => {
						process.kill(pid)
					}
				})
			}),
			ports: SubscriptionRef.changes(portsRef),
			resize: Effect.fnUntraced(function* (nextSize: {readonly cols: number; readonly rows: number}) {
				const size = yield* Ref.get(sizeRef)
				if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

				yield* Ref.set(sizeRef, nextSize)
				const snapshot = yield* Semaphore.withPermit(
					screenLock,
					Effect.sync(() => {
						screen.resize(nextSize.cols, nextSize.rows)
						return serialize.serialize({scrollback: 10_000})
					})
				)
				yield* publish({data: snapshot, type: 'snapshot'})

				const process = yield* Ref.get(processRef)
				if (!process) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: 'failed to resize terminal'}),
					try: () => {
						process.resize(nextSize.cols, nextSize.rows)
					}
				})
			}),
			restart: Queue.offer(controls, {type: 'restart'}),
			status: SubscriptionRef.changes(statusRef),
			stop: Queue.offer(controls, {type: 'stop'}),
			write: Effect.fnUntraced(function* (data: string) {
				const process = yield* Ref.get(processRef)
				if (!process) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: 'failed to write to terminal'}),
					try: () => {
						process.write(data)
					}
				})
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
