import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	Layer,
	Match,
	Option,
	PubSub,
	Queue,
	Ref,
	Semaphore,
	Stream,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import * as nodePty from '@lydell/node-pty'
import type {IPty} from '@lydell/node-pty'
import ProgressModule from '@xterm/addon-progress'
import SerializeModule from '@xterm/addon-serialize'
import HeadlessModule from '@xterm/headless'
import type {ChildProcess} from 'effect/unstable/process'

import type {TerminalEvent, TerminalState} from './schema.ts'
import {TerminalError, terminalStateActive} from './schema.ts'

type RunningProcess = {
	readonly data: {readonly dispose: () => void}
	readonly exit: {readonly dispose: () => void}
	readonly process: IPty
}

type TerminalSize = {readonly cols: number; readonly rows: number}
type QueuedData = {readonly data: string; readonly generation: number}
type QueuedWrite = {readonly data: string; readonly process: RunningProcess}
const eventBacklogCapacity = 512
const terminalReset = '\u001bc'

function parseTitleSignal(title: string): Pick<TerminalState, 'state' | 'title'> {
	const trimmed = title.trim()
	const actionRequired = /^\[\s*[!.]\s*\]\s*Action Required\b/iu
	if (actionRequired.test(trimmed)) {
		return {state: 'waiting', title: trimmed.replace(/^\[\s*[!.]\s*\]\s*/iu, '') || trimmed}
	}

	const spinner = /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-])(?:\s|\s*\|)/u.test(trimmed)
	const withoutKnownPrefix = trimmed
		.replace(/^OC\s*\|\s*/iu, '')
		.replace(/^π\s*-\s*/iu, '')
		.replace(/^\[\s*[^\]]+\s*\]\s*/u, '')
		.replace(/^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-]\s*)+/u, '')
		.replace(/^\|\s*/u, '')
		.trim()
	const nextTitle = withoutKnownPrefix || trimmed
	const segment = /^(Idle|Ready|Starting|Working|Thinking|Waiting)\b/iu.exec(nextTitle)?.[1]?.toLowerCase()

	if (segment === 'idle' || segment === 'ready') return {state: 'idle', title: nextTitle}
	if (segment === 'starting') return {state: 'starting', title: nextTitle}
	if (segment === 'waiting') return {state: 'waiting', title: nextTitle}
	if (segment === 'working' || segment === 'thinking' || spinner) return {state: 'running', title: nextTitle}
	if (trimmed !== '') return {state: 'idle', title: nextTitle}

	return {state: 'idle', title: ''}
}

function snapshotEvents(data: string, sequence: number) {
	if (data === '') return Array.empty<TerminalEvent>()

	const events: TerminalEvent[] = []
	for (let index = 0; index < data.length; index += 256 * 1024) {
		events.push({data: data.slice(index, index + 256 * 1024), sequence, type: 'data'})
	}
	return events
}

function adjacentGroups<T>(
	items: readonly T[],
	sameGroup: (previous: T, item: T) => boolean,
	merge: (previous: T, item: T) => T
) {
	return pipe(
		items,
		Array.reduce(Array.empty<T>(), (groups, item) => {
			const next = groups
			const previous = groups.at(-1)
			if (!(previous && sameGroup(previous, item))) {
				next.push(item)
				return next
			}

			next[next.length - 1] = merge(previous, item)
			return next
		})
	)
}

function queuedDataGroups<T extends QueuedData>(items: readonly T[], merge: (previous: T, item: T) => T) {
	return adjacentGroups(items, (previous, item) => previous.generation === item.generation, merge)
}

function mergeQueuedData(previous: QueuedData, item: QueuedData): QueuedData {
	return {data: `${previous.data}${item.data}`, generation: item.generation}
}

function queuedWriteGroups(items: readonly QueuedWrite[]) {
	return adjacentGroups(
		items,
		(previous, item) => previous.process === item.process,
		(previous, item) => ({data: `${previous.data}${item.data}`, process: item.process})
	)
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {readonly command?: ChildProcess.StandardCommand; readonly cwd: string}) {
		const dataQueue = yield* Queue.unbounded<QueuedData>()
		const screenQueue = yield* Queue.unbounded<QueuedData>()
		const writeQueue = yield* Queue.unbounded<QueuedWrite>()
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const events = yield* PubSub.bounded<TerminalEvent>({capacity: 1024, replay: eventBacklogCapacity})
		const lifecycleLock = yield* Semaphore.make(1)
		const screenLock = yield* Semaphore.make(1)
		const eventSequenceRef = yield* Ref.make(0)
		const parsedSequenceRef = yield* Ref.make(0)
		const screenGenerationRef = yield* Ref.make(0)
		const processRef = yield* Ref.make<RunningProcess | undefined>(undefined)
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command?.command ?? shell
		const processArgs = config.command?.args ?? []
		const processEnv = config.command?.options.env ?? {}
		const autostart = config.command === undefined
		const stateRef = yield* SubscriptionRef.make<TerminalState>({
			runId: 0,
			state: autostart ? 'starting' : 'idle',
			title: ''
		})
		const screen = new HeadlessModule.Terminal({allowProposedApi: true, cols: 120, rows: 32, scrollback: 10_000})
		const serialize = new SerializeModule.SerializeAddon()
		const progress = new ProgressModule.ProgressAddon()
		screen.loadAddon(serialize)
		screen.loadAddon(progress)

		const publish = Effect.fnUntraced(function* (data: string) {
			const sequence = yield* Ref.updateAndGet(eventSequenceRef, sequence => sequence + 1)
			yield* PubSub.publish(events, {data, sequence, type: 'data' as const})

			return sequence
		})
		const requestSnapshot = Semaphore.withPermit(
			screenLock,
			Effect.gen(function* () {
				const data = serialize.serialize({scrollback: 10_000})
				const sequence = yield* Ref.get(parsedSequenceRef)

				return {data, sequence}
			})
		)

		function setState(state: TerminalState['state']) {
			return SubscriptionRef.update(stateRef, current => ({...current, state}))
		}

		function setProgressState(progress: ProgressModule.IProgressState) {
			return SubscriptionRef.update(stateRef, current => {
				if (current.state === 'stopped' || current.state === 'exited' || current.state === 'failed') return current
				const state = pipe(
					progress.state,
					Match.value,
					Match.when(0, () => 'idle' as const),
					Match.when(2, () => 'failed' as const),
					Match.when(4, () => 'waiting' as const),
					Match.orElse(() => 'running' as const)
				)

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
				runId: state.runId + 1,
				state: 'starting' as const,
				title: ''
			})),
			Effect.andThen(SubscriptionRef.get(stateRef))
		)

		screen.parser.registerOscHandler(0, title => {
			Effect.runFork(setTitle(title))
			return false
		})
		screen.parser.registerOscHandler(2, title => {
			Effect.runFork(setTitle(title))
			return false
		})
		progress.onChange(nextProgress => {
			Effect.runFork(setProgressState(nextProgress))
		})

		const interruptProcess = Effect.fnUntraced(function* (subprocess: IPty, signal: NodeJS.Signals) {
			yield* Effect.sync(() => {
				try {
					subprocess.kill(signal)
				} catch {}
			})
		})

		const terminateProcess = Effect.fnUntraced(function* (subprocess: IPty) {
			yield* interruptProcess(subprocess, 'SIGTERM')
			yield* Effect.sleep('250 millis')
			yield* interruptProcess(subprocess, 'SIGKILL')
		})

		const writeScreen = Effect.fnUntraced(function* (input: QueuedData) {
			const generation = yield* Ref.get(screenGenerationRef)
			if (generation !== input.generation) return

			yield* Semaphore.withPermit(
				screenLock,
				pipe(
					Effect.callback<void>(resume => {
						screen.write(input.data, () => {
							resume(Effect.void)
						})
					}),
					Effect.andThen(
						Effect.gen(function* () {
							const generation = yield* Ref.get(screenGenerationRef)
							if (generation === input.generation) {
								const sequence = yield* publish(input.data)
								yield* Ref.set(parsedSequenceRef, sequence)
							}
						})
					)
				)
			)
		})

		const clearProcess = Effect.fnUntraced(function* (handle: RunningProcess) {
			yield* Ref.update(processRef, current => (current === handle ? undefined : current))
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
			const generation = yield* Ref.updateAndGet(screenGenerationRef, generation => generation + 1)
			yield* Semaphore.withPermit(
				screenLock,
				pipe(
					Effect.sync(() => {
						screen.reset()
					}),
					Effect.andThen(publish(terminalReset)),
					Effect.tap(sequence => Ref.set(parsedSequenceRef, sequence))
				)
			)
			yield* startRun

			const size = yield* Ref.get(sizeRef)
			const subprocess = yield* Effect.try({
				catch: cause => new TerminalError({cause, message: `failed to spawn terminal in ${config.cwd}`}),
				try: () =>
					nodePty.spawn(processCommand, [...processArgs], {
						cols: size.cols,
						cwd: config.cwd,
						env: {...process.env, ...processEnv, TERM: 'xterm-256color'},
						name: 'xterm-256color',
						rows: size.rows
					})
			})
			const data = subprocess.onData(data => {
				Queue.offerUnsafe(dataQueue, {data, generation})
			})
			const exit = subprocess.onExit(event => {
				Effect.runFork(
					Semaphore.withPermit(
						lifecycleLock,
						Effect.gen(function* () {
							const current = yield* Ref.get(processRef)
							if (current !== handle) return

							yield* clearProcess(handle)
							if (autostart) {
								yield* pipe(
									Effect.sleep('1 second'),
									Effect.andThen(spawnProcess()),
									Effect.catch(() => setState('failed'))
								)
								return
							}
							yield* setState(event.exitCode === 0 ? 'exited' : 'failed')
						})
					)
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

		yield* pipe(
			Stream.fromQueue(dataQueue),
			Stream.groupedWithin(256, Duration.millis(8)),
			Stream.runForEach(items =>
				Effect.forEach(
					queuedDataGroups(Array.fromIterable(items), mergeQueuedData),
					item =>
						Effect.gen(function* () {
							const generation = yield* Ref.get(screenGenerationRef)
							if (generation !== item.generation) return

							yield* Queue.offer(screenQueue, item)
						}),
					{discard: true}
				)
			),
			Effect.forkScoped
		)
		yield* pipe(
			Stream.fromQueue(screenQueue),
			Stream.groupedWithin(256, Duration.millis(16)),
			Stream.runForEach(items =>
				Effect.forEach(queuedDataGroups(Array.fromIterable(items), mergeQueuedData), writeScreen, {discard: true})
			),
			Effect.forkScoped
		)

		yield* Effect.addFinalizer(() =>
			Effect.all(
				[
					stopProcess(),
					PubSub.shutdown(events),
					Queue.shutdown(dataQueue),
					Queue.shutdown(screenQueue),
					Queue.shutdown(writeQueue),
					Queue.shutdown(resizeQueue),
					Effect.sync(() => screen.dispose())
				],
				{concurrency: 'unbounded', discard: true}
			)
		)
		if (autostart) {
			yield* pipe(
				startProcess(),
				Semaphore.withPermit(lifecycleLock),
				Effect.catch(() => setState('failed'))
			)
		}

		const resizeProcess = Effect.fnUntraced(function* (nextSize: TerminalSize) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)
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
					process.process.resize(nextSize.cols, nextSize.rows)
				}
			})
		})
		yield* pipe(
			Stream.fromQueue(resizeQueue),
			Stream.groupedWithin(32, Duration.millis(16)),
			Stream.runForEach(items =>
				pipe(Array.last(Array.fromIterable(items)), Option.match({onNone: () => Effect.void, onSome: resizeProcess}))
			),
			Effect.forkScoped
		)
		const writeProcess = Effect.fnUntraced(function* (input: QueuedWrite) {
			const process = yield* Ref.get(processRef)
			if (process !== input.process) return

			yield* Effect.try({
				catch: cause => new TerminalError({cause, message: 'failed to write to terminal'}),
				try: () => {
					input.process.process.write(input.data)
				}
			})
		})
		yield* pipe(
			Stream.fromQueue(writeQueue),
			Stream.groupedWithin(128, Duration.millis(4)),
			Stream.runForEach(items =>
				Effect.forEach(queuedWriteGroups(Array.fromIterable(items)), writeProcess, {discard: true})
			),
			Effect.forkScoped
		)
		const eventsStream = Stream.scoped(
			Stream.unwrap(
				Effect.gen(function* () {
					const subscription = yield* PubSub.subscribe(events)
					const snapshot = yield* requestSnapshot
					const pending = yield* PubSub.takeUpTo(subscription, Number.POSITIVE_INFINITY)
					const replay = Array.filter(pending, event => event.sequence > snapshot.sequence)
					const replaySequence = replay.at(-1)?.sequence ?? snapshot.sequence

					return pipe(
						Stream.fromIterable([
							{data: terminalReset, sequence: snapshot.sequence, type: 'data' as const},
							...snapshotEvents(snapshot.data, snapshot.sequence),
							...replay,
							...Array.filter(pending, event => event.sequence > replaySequence)
						]),
						Stream.concat(Stream.fromEffectRepeat(PubSub.take(subscription)))
					)
				})
			)
		)
		const stateUpdates = Stream.unwrap(
			pipe(
				SubscriptionRef.get(stateRef),
				Effect.map(state => Stream.concat(Stream.drop(1)(SubscriptionRef.changes(stateRef)))(Stream.make(state)))
			)
		)
		const updates = Stream.merge(
			stateUpdates.pipe(Stream.map(state => ({state, type: 'state' as const}))),
			eventsStream
		)

		return {
			resize: Effect.fnUntraced(function* (size: TerminalSize) {
				yield* Queue.offer(resizeQueue, size)
			}),
			restart: Effect.fnUntraced(function* () {
				return yield* pipe(
					startProcess(),
					Semaphore.withPermit(lifecycleLock),
					Effect.catch(() => pipe(setState('failed'), Effect.andThen(SubscriptionRef.get(stateRef))))
				)
			}),
			stateUpdates,
			stop: Effect.fnUntraced(function* () {
				yield* pipe(stopProcess('stopped'), Semaphore.withPermit(lifecycleLock))
				return yield* SubscriptionRef.get(stateRef)
			}),
			updates,
			write: Effect.fnUntraced(function* (data: string) {
				if (data === '') return

				const process = yield* Ref.get(processRef)
				if (process) yield* Queue.offer(writeQueue, {data, process})
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
