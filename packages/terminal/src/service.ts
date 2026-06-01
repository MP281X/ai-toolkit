import nodeProcess from 'node:process'

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

import * as nodePty from '@lydell/node-pty'
import type {IPty} from '@lydell/node-pty'
import {SerializeAddon} from '@xterm/addon-serialize'
import xtermHeadless from '@xterm/headless'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {TerminalEvent, TerminalState, TerminalStatus} from './schema.ts'
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

function descendantsOf(ancestorPid: number, parents: ReadonlyMap<number, number>) {
	const descendants: number[] = []
	for (const pid of parents.keys()) {
		if (pid !== ancestorPid && isDescendant(pid, ancestorPid, parents)) descendants.push(pid)
	}
	return descendants
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

const initialSize = {cols: 120, rows: 32} as const
const scrollback = 10_000
const snapshotChunkSize = 64 * 1024
const cleanupSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

function snapshotEvents(data: string) {
	if (data === '') return [{data, type: 'snapshot'} as const]

	const events: TerminalEvent[] = []
	for (let index = 0; index < data.length; index += snapshotChunkSize) {
		events.push({data: data.slice(index, index + snapshotChunkSize), type: 'snapshot'})
	}
	return events
}

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
		const portOwners = yield* Ref.make<ReadonlyMap<number, number>>(new Map())
		const processRef = yield* Ref.make<IPty | undefined>(undefined)
		const screenLock = yield* Semaphore.make(1)
		const sequenceRef = yield* Ref.make(0)
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command ?? shell
		const processArgs = config.args ?? []
		const restartPolicy = config.restart ?? (config.command ? 'never' : 'always')
		const stateRef = yield* SubscriptionRef.make<TerminalState>({
			args: [...processArgs],
			command: processCommand,
			cwd: config.cwd,
			ports: [],
			runId: 0,
			size: initialSize,
			status: {state: 'starting'}
		})
		const screen = new xtermHeadless.Terminal({
			allowProposedApi: true,
			cols: initialSize.cols,
			rows: initialSize.rows,
			scrollback
		})
		const serialize = new SerializeAddon()
		let currentProcess: IPty | undefined

		screen.loadAddon(serialize)

		function killProcessSync(subprocess: IPty | undefined, signal: NodeJS.Signals) {
			if (!subprocess?.pid) return

			try {
				if (nodeProcess.platform !== 'win32') nodeProcess.kill(-subprocess.pid, signal)
			} catch {}
			try {
				subprocess.kill(signal)
			} catch {}
		}

		function cleanupProcessSync() {
			killProcessSync(currentProcess, 'SIGKILL')
		}

		for (const signal of cleanupSignals) {
			nodeProcess.on(signal, cleanupProcessSync)
		}
		nodeProcess.on('exit', cleanupProcessSync)

		yield* Effect.addFinalizer(() =>
			Effect.sync(() => {
				for (const signal of cleanupSignals) {
					nodeProcess.off(signal, cleanupProcessSync)
				}
				nodeProcess.off('exit', cleanupProcessSync)
			})
		)

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
				const data = serialize.serialize({scrollback})
				const sequence = yield* Ref.get(sequenceRef)

				return {data, sequence}
			})
		)

		function setStatus(status: TerminalStatus) {
			return SubscriptionRef.update(stateRef, state => ({...state, status}))
		}

		const startRun = Effect.gen(function* () {
			yield* SubscriptionRef.update(stateRef, state => ({
				...state,
				ports: [],
				runId: state.runId + 1,
				status: {state: 'starting' as const}
			}))

			return yield* SubscriptionRef.get(stateRef)
		})

		function setPorts(ports: readonly number[]) {
			return SubscriptionRef.updateSome(stateRef, state =>
				state.ports.length === ports.length && state.ports.every((port, index) => port === ports[index])
					? Option.none()
					: Option.some({...state, ports: [...ports]})
			)
		}

		const interruptProcessTree = Effect.fnUntraced(function* (subprocess: IPty, signal: NodeJS.Signals) {
			const descendants = yield* pipe(
				readProcessParents,
				Effect.map(parents => descendantsOf(subprocess.pid, parents)),
				Effect.timeoutOption('250 millis'),
				Effect.map(option => Option.getOrElse(option, () => [] as number[])),
				Effect.catch(() => Effect.succeed([] as number[]))
			)

			yield* Effect.sync(() => {
				for (const pid of descendants.toReversed()) {
					try {
						nodeProcess.kill(pid, signal)
					} catch {}
				}
				try {
					if (nodeProcess.platform !== 'win32') nodeProcess.kill(-subprocess.pid, signal)
				} catch {}
				try {
					subprocess.kill(signal)
				} catch {}
			})
		})

		const terminateProcess = Effect.fnUntraced(function* (subprocess: IPty) {
			yield* interruptProcessTree(subprocess, 'SIGTERM')
			yield* Effect.sleep('250 millis')
			yield* interruptProcessTree(subprocess, 'SIGKILL')
		})

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
				const size = (yield* SubscriptionRef.get(stateRef)).size
				const exited = yield* Deferred.make<{readonly exitCode: number; readonly signal?: number}>()
				let didExit = false
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

				currentProcess = subprocess
				yield* Ref.set(processRef, subprocess)
				yield* setStatus({pid: subprocess.pid, state: 'running'})

				return {
					data,
					didExit: () => didExit,
					exit,
					exited,
					process: subprocess,
					terminate: terminateProcess(subprocess)
				}
			}),
			subprocess =>
				Effect.gen(function* () {
					yield* Effect.sync(() => {
						subprocess.data.dispose()
						subprocess.exit.dispose()
					})
					if (!subprocess.didExit()) yield* pipe(subprocess.terminate, Effect.ignore)
					if (currentProcess === subprocess.process) currentProcess = undefined
					yield* Ref.update(processRef, current => (current === subprocess.process ? undefined : current))
				})
		)

		yield* pipe(
			Effect.gen(function* () {
				let restart = true
				while (restart) {
					yield* resetScreen
					yield* setStatus({state: 'starting'})
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
					yield* setPorts([])

					if (action.type === 'stop') {
						yield* setStatus({state: 'stopped'})
						const control = yield* Queue.take(controls)
						restart = control.type === 'restart'
						if (restart) yield* Effect.sleep('250 millis')
						continue
					} else if (action.type === 'restart') {
						restart = true
					} else if (action.type === 'error') {
						yield* setStatus({state: 'failed'})
						restart = restartPolicy === 'always' || restartPolicy === 'failed'
					} else {
						const failed = action.event.exitCode !== 0
						yield* setStatus({
							exitCode: action.event.exitCode,
							...(action.event.signal === undefined ? {} : {signal: action.event.signal}),
							state: failed ? 'failed' : 'exited'
						})
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
					yield* setPorts([])
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
				yield* setPorts(nextPorts)
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
							Stream.fromIterable([...snapshotEvents(snapshot.data), ...initialEvents]),
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
						nodeProcess.kill(pid)
					}
				})
			}),
			resize: Effect.fnUntraced(function* (nextSize: {readonly cols: number; readonly rows: number}) {
				const size = (yield* SubscriptionRef.get(stateRef)).size
				if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

				yield* SubscriptionRef.update(stateRef, state => ({...state, size: nextSize}))
				yield* Semaphore.withPermit(
					screenLock,
					Effect.sync(() => {
						screen.resize(nextSize.cols, nextSize.rows)
					})
				)

				const process = yield* Ref.get(processRef)
				if (!process) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: 'failed to resize terminal'}),
					try: () => {
						process.resize(nextSize.cols, nextSize.rows)
					}
				})
			}),
			restart: pipe(
				startRun,
				Effect.tap(() => Queue.offer(controls, {type: 'restart'}))
			),
			state: stateRef,
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
