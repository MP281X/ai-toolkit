import nodeProcess from 'node:process'

import {
	Array,
	Config,
	Context,
	Effect,
	Layer,
	Order,
	Option,
	PubSub,
	Queue,
	Ref,
	Result,
	Schedule,
	Stream,
	String,
	SubscriptionRef,
	Tuple,
	flow,
	pipe
} from 'effect'

import * as nodePty from '@lydell/node-pty'
import type {IPty} from '@lydell/node-pty'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import type {TerminalEvent, TerminalState} from './schema.ts'
import {TerminalError, terminalStateActive} from './schema.ts'

type RunningProcess = {
	readonly data: {readonly dispose: () => void}
	readonly exit: {readonly dispose: () => void}
	readonly process: IPty
}

function parseProcessParents(output: string) {
	return new Map(
		pipe(
			String.linesIterator(output),
			Array.fromIterable,
			Array.filterMap(line => {
				const columns = String.split(/\s+/)(String.trim(line))
				const pid = Number(columns[0] ?? Number.NaN)
				const ppid = Number(columns[1] ?? Number.NaN)

				return Number.isFinite(pid) && Number.isFinite(ppid) ? Result.succeed(Tuple.make(pid, ppid)) : Result.failVoid
			})
		)
	)
}

function parseListeningPorts(output: string) {
	return pipe(
		String.linesIterator(output),
		Array.fromIterable,
		Array.filterMap(line => {
			const columns = String.split(/\s+/)(String.trim(line))
			const port = Number(columns[3]?.match(/:(\d+)$/)?.[1])
			const pid = Number(line.match(/pid=(\d+)/)?.[1])

			return Number.isFinite(port) && Number.isFinite(pid) ? Result.succeed({pid, port}) : Result.failVoid
		})
	)
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
	return pipe(
		Array.fromIterable(parents.keys()),
		Array.filter(pid => pid !== ancestorPid && isDescendant(pid, ancestorPid, parents))
	)
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

const initialSize = {cols: 120, rows: 32}
const maxHistoryEvents = 10_000

function samePorts(left: readonly number[], right: readonly number[]) {
	return left.length === right.length && Array.every(left, (leftPort, index) => leftPort === right[index])
}

function parseTitleSignal(title: string): Pick<TerminalState, 'state' | 'title'> {
	const trimmed = String.trim(title)
	const actionRequired = /^\[\s*[!.]\s*\]\s*Action Required\b/i
	if (actionRequired.test(trimmed)) {
		return {state: 'needs_input', title: trimmed.replace(/^\[\s*[!.]\s*\]\s*/i, '') || trimmed}
	}

	const spinner = /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-])(?:\s|\s*\|)/u.test(trimmed)
	const withoutKnownPrefix = trimmed
		.replace(/^OC\s*\|\s*/i, '')
		.replace(/^π\s*-\s*/i, '')
		.replace(/^\[\s*[^\]]+\s*\]\s*/, '')
		.replace(/^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-]\s*)+/, '')
		.replace(/^\|\s*/, '')
		.trim()
	const nextTitle = withoutKnownPrefix || trimmed
	const segment = nextTitle.match(/^(Idle|Ready|Starting|Working|Thinking|Waiting)\b/i)?.[1]?.toLowerCase()

	if (segment === 'idle' || segment === 'ready') return {state: 'idle', title: nextTitle}
	if (segment === 'starting') return {state: 'starting', title: nextTitle}
	if (segment === 'waiting') return {state: 'waiting', title: nextTitle}
	if (segment === 'working' || segment === 'thinking' || spinner) return {state: 'running', title: nextTitle}
	if (String.isNonEmpty(trimmed)) return {state: 'idle', title: nextTitle}

	return {state: 'idle', title: ''}
}

function completeSignalData(input: string) {
	if (input.endsWith('\x1b')) return {complete: input.slice(0, -1), pending: '\x1b'}

	const start = input.lastIndexOf('\x1b]')
	if (start === -1) return {complete: input, pending: ''}

	const tail = input.slice(start)
	if (tail.includes('\x07') || tail.includes('\x1b\\')) return {complete: input, pending: ''}

	return {complete: input.slice(0, start), pending: tail}
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {
		readonly args?: readonly string[]
		readonly command?: string
		readonly cwd: string
	}) {
		const dataQueue = yield* Queue.unbounded<string>()
		const events = yield* PubSub.bounded<{readonly event: TerminalEvent; readonly sequence: number}>({capacity: 256})
		const history = yield* Ref.make<readonly {readonly event: TerminalEvent; readonly sequence: number}[]>([])
		const sequenceRef = yield* Ref.make(0)
		const signalBuffer = yield* Ref.make('')
		const portOwners = yield* Ref.make<ReadonlyMap<number, number>>(new Map())
		const processRef = yield* Ref.make<RunningProcess | undefined>(undefined)
		const sizeRef = yield* Ref.make(initialSize)
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command ?? shell
		const processArgs = config.args ?? []
		const autostart = config.command === undefined
		const stateRef = yield* SubscriptionRef.make<TerminalState>({
			ports: [],
			runId: 0,
			state: autostart ? 'starting' : 'idle',
			title: ''
		})
		const publish = Effect.fnUntraced(function* (event: TerminalEvent) {
			const sequence = yield* Ref.updateAndGet(sequenceRef, sequence => sequence + 1)
			const published = {event, sequence}
			yield* Ref.update(history, current =>
				event.type === 'reset' ? [] : [...current, published].slice(-maxHistoryEvents)
			)
			yield* PubSub.publish(events, published)
		})

		function setState(state: TerminalState['state']) {
			return SubscriptionRef.update(stateRef, current => ({...current, state}))
		}

		function setActiveState(state: 'idle' | 'running') {
			return SubscriptionRef.update(stateRef, current => {
				if (current.state !== 'idle' && current.state !== 'starting' && current.state !== 'running') return current
				return {...current, state}
			})
		}

		function setTitle(title: string) {
			return SubscriptionRef.update(stateRef, current => {
				if (!terminalStateActive(current.state)) return current
				return {...current, ...parseTitleSignal(title)}
			})
		}

		const startRun = pipe(
			SubscriptionRef.update(stateRef, state => ({
				...state,
				ports: [],
				runId: state.runId + 1,
				state: 'starting' as const,
				title: ''
			})),
			Effect.andThen(SubscriptionRef.get(stateRef))
		)

		function setPorts(ports: readonly number[]) {
			return SubscriptionRef.updateSome(stateRef, state =>
				samePorts(state.ports, ports) ? Option.none() : Option.some({...state, ports: [...ports]})
			)
		}

		function readSignals(data: string) {
			for (const match of data.matchAll(/\x1b\](?:0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/gu)) {
				const title = match[1]
				if (title !== undefined) Effect.runFork(setTitle(title))
			}
			for (const match of data.matchAll(/\x1b\]9;4;([^\x07\x1b]*)(?:\x07|\x1b\\)/gu)) {
				Effect.runFork(setActiveState(match[1] === '0' ? 'idle' : 'running'))
			}
		}

		const readBufferedSignals = Effect.fnUntraced(function* (data: string) {
			const pending = yield* Ref.get(signalBuffer)
			const next = completeSignalData(`${pending}${data}`)
			yield* Ref.set(signalBuffer, next.pending)
			readSignals(next.complete)
		})

		const interruptProcessTree = Effect.fnUntraced(function* (subprocess: IPty, signal: NodeJS.Signals) {
			const descendants = yield* pipe(
				Effect.all([readProcessParents, Ref.get(portOwners)]),
				Effect.map(([parents, owners]) =>
					Array.dedupe([...descendantsOf(subprocess.pid, parents), ...Array.fromIterable(owners.values())])
				),
				Effect.timeoutOption('250 millis'),
				Effect.map(option => Option.getOrElse(option, Array.empty<number>)),
				Effect.catch(() => Effect.succeed(Array.empty<number>()))
			)

			yield* Effect.sync(() => {
				try {
					if (nodeProcess.platform !== 'win32') nodeProcess.kill(-subprocess.pid, signal)
				} catch {}
				for (const pid of descendants.toReversed()) {
					try {
						nodeProcess.kill(pid, signal)
					} catch {}
				}
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

		const writeScreen = Effect.fnUntraced(function* (data: string) {
			yield* readBufferedSignals(data)
			yield* publish({data, type: 'data'})
		})

		const clearProcess = Effect.fnUntraced(function* (handle: RunningProcess) {
			yield* Ref.update(processRef, current => (current === handle ? undefined : current))
			yield* Ref.set(portOwners, new Map())
			yield* setPorts([])
		})

		const stopProcess = Effect.fnUntraced(function* (state?: TerminalState['state']) {
			const handle = yield* Ref.get(processRef)
			if (!handle) {
				if (state) yield* setState(state)
				return
			}

			yield* Effect.sync(() => {
				handle.data.dispose()
				handle.exit.dispose()
			})
			yield* clearProcess(handle)
			yield* pipe(terminateProcess(handle.process), Effect.ignore)
			if (state) yield* setState(state)
		})

		const spawnProcess = Effect.fnUntraced(function* () {
			yield* publish({type: 'reset'})
			yield* startRun

			const size = yield* Ref.get(sizeRef)
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
				Effect.runFork(
					Effect.gen(function* () {
						const current = yield* Ref.get(processRef)
						if (current !== handle) return

						yield* clearProcess(handle)
						if (autostart) {
							yield* spawnProcess()
							return
						}
						yield* setState(event.exitCode === 0 ? 'exited' : 'failed')
					})
				)
			})
			const handle = {data, exit, process: subprocess}
			yield* Ref.set(processRef, handle)
			yield* setState('running')

			return yield* SubscriptionRef.get(stateRef)
		})

		const startProcess = Effect.fnUntraced(function* () {
			yield* stopProcess()
			return yield* spawnProcess()
		})

		yield* pipe(Stream.fromQueue(dataQueue), Stream.runForEach(writeScreen), Effect.forkScoped)

		yield* Effect.addFinalizer(() =>
			Effect.all([stopProcess(), PubSub.shutdown(events), Queue.shutdown(dataQueue)], {
				concurrency: 'unbounded',
				discard: true
			})
		)
		if (autostart) {
			yield* pipe(
				startProcess(),
				Effect.catch(() => setState('failed'))
			)
		}

		yield* pipe(
			Effect.gen(function* () {
				const process = yield* Ref.get(processRef)
				if (!process?.process.pid) {
					yield* Ref.set(portOwners, new Map())
					yield* setPorts([])
					return
				}

				const [parents, listeningPorts] = yield* Effect.all([readProcessParents, readListeningPorts])
				const nextPortOwners = new Map<number, number>()
				const nextPorts = pipe(
					listeningPorts,
					Array.filter(port => isDescendant(port.pid, process.process.pid, parents)),
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

		const resize = Effect.fnUntraced(function* (nextSize: {readonly cols: number; readonly rows: number}) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)

			const process = yield* Ref.get(processRef)
			if (!process) return

			yield* Effect.try({
				catch: cause => new TerminalError({cause, message: 'failed to resize terminal'}),
				try: () => {
					process.process.resize(nextSize.cols, nextSize.rows)
				}
			})
		})
		const write = Effect.fnUntraced(function* (data: string) {
			const process = yield* Ref.get(processRef)
			if (!process) return

			yield* Effect.try({
				catch: cause => new TerminalError({cause, message: 'failed to write to terminal'}),
				try: () => {
					process.process.write(data)
				}
			})
		})
		const eventsStream = Stream.scoped(
			Stream.unwrap(
				Effect.gen(function* () {
					const subscription = yield* PubSub.subscribe(events)
					const replay = yield* Ref.get(history)
					const lastReplaySequence = replay.at(-1)?.sequence ?? 0
					const pending = yield* PubSub.takeUpTo(subscription, Number.POSITIVE_INFINITY)

					return pipe(
						Stream.fromIterable([...replay, ...Array.filter(pending, event => event.sequence > lastReplaySequence)]),
						Stream.concat(Stream.fromEffectRepeat(PubSub.take(subscription)))
					)
				})
			)
		)
		const ports = pipe(
			SubscriptionRef.changes(stateRef),
			Stream.map(state => state.ports),
			Stream.changesWith(samePorts)
		)
		const updates = Stream.merge(
			SubscriptionRef.changes(stateRef).pipe(Stream.map(state => ({state, type: 'state' as const}))),
			eventsStream.pipe(Stream.map(published => ({event: published.event, type: 'event' as const})))
		)

		return {
			ports,
			resize: Effect.fnUntraced(function* (size: {readonly cols: number; readonly rows: number}) {
				yield* resize(size)
				return yield* SubscriptionRef.get(stateRef)
			}),
			restart: Effect.fnUntraced(function* () {
				return yield* pipe(
					startProcess(),
					Effect.catch(() => pipe(setState('failed'), Effect.andThen(SubscriptionRef.get(stateRef))))
				)
			}),
			stop: Effect.fnUntraced(function* () {
				yield* stopProcess('stopped')
				return yield* SubscriptionRef.get(stateRef)
			}),
			updates,
			write: Effect.fnUntraced(function* (data: string) {
				yield* write(data)
				return yield* SubscriptionRef.get(stateRef)
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
