import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	Layer,
	Option,
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
import {SerializeAddon} from '@xterm/addon-serialize'
import HeadlessModule from '@xterm/headless'
import type {ChildProcess} from 'effect/unstable/process'

import {terminalChunks, terminalOscUpdates, terminalTitleStatus} from './model.ts'
import type {TerminalFrame, TerminalInput, TerminalSize} from './schema.ts'
import {TerminalError, TerminalStatus, terminalStatusActive} from './schema.ts'

function terminalInputString(input: TerminalInput) {
	return input.type === 'text' ? input.data : new TextDecoder().decode(input.data)
}

function pauseProcess(process: IPty) {
	if ('pause' in process && typeof process.pause === 'function') process.pause()
}

function resumeProcess(process: IPty) {
	if ('resume' in process && typeof process.resume === 'function') process.resume()
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {readonly command?: ChildProcess.StandardCommand; readonly cwd: string}) {
		const dataQueue = yield* Queue.bounded<{readonly data: string; readonly process: IPty}>(128)
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const callbackQueue = yield* Queue.unbounded<Effect.Effect<void, TerminalError>>()
		const lifecycleLock = yield* Semaphore.make(1)
		const screenLock = yield* Semaphore.make(1)
		const processRef = yield* Ref.make<
			| {
					readonly data: {readonly dispose: () => void}
					readonly exit: {readonly dispose: () => void}
					readonly process: IPty
			  }
			| undefined
		>(void 0)
		const replayProcessRef = yield* Ref.make<IPty | undefined>(void 0)
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const oscRef = yield* Ref.make('')
		const attachedRef = yield* Ref.make<readonly Queue.Queue<TerminalFrame>[]>([])
		const sequenceRef = yield* Ref.make(0)
		const screen = new HeadlessModule.Terminal({allowProposedApi: true, cols: 120, rows: 32, scrollback: 20_000})
		const serialize = new SerializeAddon()
		screen.loadAddon({
			activate: terminal => {
				Reflect.apply(serialize.activate.bind(serialize), serialize, [terminal])
			},
			dispose: () => {
				serialize.dispose()
			}
		})
		const shell = yield* Config.withDefault(Config.string('SHELL'), 'bash')
		const processCommand = config.command?.command ?? shell
		const processArgs = config.command?.args ?? []
		const processEnv = config.command?.options.env ?? {}
		const processCwd = config.command?.options.cwd ?? config.cwd
		const restartOnExit = config.command === undefined
		const status = yield* SubscriptionRef.make<TerminalStatus>(new TerminalStatus({state: 'idle', title: ''}))

		yield* pipe(
			Stream.fromQueue(callbackQueue),
			Stream.runForEach(effect => effect),
			Effect.forkScoped
		)

		const nextSequence = Effect.fnUntraced(function* () {
			return yield* Ref.modify(sequenceRef, current => [current, current + 1] as const)
		})

		const dropQueues = Effect.fnUntraced(function* (dropped: readonly Queue.Queue<TerminalFrame>[]) {
			if (!Array.isReadonlyArrayNonEmpty(dropped)) return
			yield* Ref.update(attachedRef, current => Array.filter(current, queue => !Array.contains(dropped, queue)))
			yield* Effect.forEach(dropped, Queue.shutdown, {discard: true})
		})

		const publishFrame = Effect.fnUntraced(function* (frame: TerminalFrame) {
			const attached = yield* Ref.get(attachedRef)
			const dropped = yield* Effect.sync(() => Array.filter(attached, queue => !Queue.offerUnsafe(queue, frame)))
			yield* dropQueues(dropped)
		})

		const publishStatus = Effect.fnUntraced(function* (nextStatus: TerminalStatus) {
			yield* SubscriptionRef.getAndUpdateSome(status, current =>
				current.state === nextStatus.state && current.title === nextStatus.title
					? Option.none()
					: Option.some(nextStatus)
			)
		})

		function setStatus(state: TerminalStatus['state']) {
			return SubscriptionRef.get(status).pipe(
				Effect.flatMap(current => publishStatus(new TerminalStatus({...current, state})))
			)
		}

		function setTitle(title: string) {
			return SubscriptionRef.get(status).pipe(
				Effect.flatMap(current => {
					if (!terminalStatusActive(current.state)) return Effect.void
					return publishStatus(new TerminalStatus({...current, ...terminalTitleStatus(title)}))
				})
			)
		}

		function setProgress(state: TerminalStatus['state']) {
			return SubscriptionRef.get(status).pipe(
				Effect.flatMap(current =>
					terminalStatusActive(current.state) ? publishStatus(new TerminalStatus({...current, state})) : Effect.void
				)
			)
		}

		const parseScreen = Effect.fnUntraced(function* (chunk: string) {
			yield* Effect.callback<true>(resume => {
				screen.write(chunk, () => {
					resume(Effect.succeed(true))
				})
			})
		})

		const writeOutput = Effect.fnUntraced(function* (chunk: string) {
			const updates = yield* Ref.modify(oscRef, carry => {
				const parsed = terminalOscUpdates(chunk, carry)
				return [parsed.updates, parsed.carry] as const
			})
			for (const update of updates) {
				yield* update.type === 'title' ? setTitle(update.title) : setProgress(update.state)
			}
			yield* parseScreen(chunk)
			yield* publishFrame({data: chunk, sequence: yield* nextSequence(), type: 'output'})
		})

		const resetScreen = Effect.fnUntraced(function* () {
			yield* Effect.sync(() => {
				screen.reset()
			})
			yield* publishFrame({sequence: yield* nextSequence(), type: 'reset'})
		})

		const resizeLocked = Effect.fnUntraced(function* (nextSize: TerminalSize) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)
			const process = yield* Ref.get(processRef)
			yield* Effect.try({
				catch: cause => new TerminalError({cause, message: 'failed to resize terminal'}),
				try: () => {
					screen.resize(nextSize.cols, nextSize.rows)
					if (process) process.process.resize(nextSize.cols, nextSize.rows)
				}
			})
		})

		const waitForDataQueueDrain = Effect.fnUntraced(function* () {
			while ((yield* Queue.size(dataQueue)) > 32) {
				yield* Effect.sleep('16 millis')
			}
		})

		const stopProcess = Effect.fnUntraced(function* (state?: TerminalStatus['state']) {
			const handle = yield* Ref.get(processRef)
			if (!handle) {
				if (state) yield* setStatus(state)
				return
			}

			yield* Effect.sync(() => {
				handle.data.dispose()
				handle.exit.dispose()
			})
			yield* Ref.update(processRef, current => (current === handle ? undefined : current))
			yield* Effect.sync(() => {
				handle.process.kill('SIGTERM')
			})
			yield* Effect.sleep('250 millis')
			if ((yield* Ref.get(processRef)) === handle) {
				yield* Effect.sync(() => {
					handle.process.kill('SIGKILL')
				})
			}
			if (state) yield* setStatus(state)
		})

		const spawnProcess = Effect.fnUntraced(function* () {
			yield* stopProcess()
			yield* Ref.set(replayProcessRef, undefined)
			yield* Ref.set(oscRef, '')
			yield* screenLock.withPermit(resetScreen())
			yield* publishStatus(new TerminalStatus({state: 'starting', title: ''}))

			const size = yield* Ref.get(sizeRef)
			const subprocess = yield* Effect.try({
				catch: cause => new TerminalError({cause, message: `failed to spawn terminal in ${config.cwd}`}),
				try: () =>
					nodePty.spawn(processCommand, [...processArgs], {
						cols: size.cols,
						cwd: processCwd,
						env: {...process.env, ...processEnv, TERM: 'xterm-256color'},
						name: 'xterm-256color',
						rows: size.rows
					})
			})
			const backpressure = {draining: false, pending: Array.empty<{readonly data: string; readonly process: IPty}>()}
			const drainBackpressure = Effect.fnUntraced(function* () {
				while (!Array.isReadonlyArrayEmpty(backpressure.pending)) {
					for (const next of backpressure.pending.splice(0)) {
						yield* Queue.offer(dataQueue, next)
					}
				}
				yield* waitForDataQueueDrain()
			})
			const data = subprocess.onData(chunk => {
				if (Queue.offerUnsafe(dataQueue, {data: chunk, process: subprocess})) return

				if (backpressure.pending.length >= 1024) {
					Queue.offerUnsafe(callbackQueue, lifecycleLock.withPermit(stopProcess('failed')))
					return
				}

				backpressure.pending.push({data: chunk, process: subprocess})
				if (backpressure.draining) return

				backpressure.draining = true
				pauseProcess(subprocess)
				Queue.offerUnsafe(
					callbackQueue,
					drainBackpressure().pipe(
						Effect.ensuring(
							Effect.sync(() => {
								backpressure.draining = false
								resumeProcess(subprocess)
							})
						)
					)
				)
			})
			const exit = subprocess.onExit(event => {
				Queue.offerUnsafe(
					callbackQueue,
					Semaphore.withPermit(
						lifecycleLock,
						Effect.gen(function* () {
							const current = yield* Ref.get(processRef)
							if (current?.process !== subprocess) return

							yield* Ref.update(processRef, value => (value?.process === subprocess ? undefined : value))
							if (restartOnExit) {
								yield* Effect.andThen(Effect.sleep('1 second'), spawnProcess())
								return
							}
							yield* setStatus(event.exitCode === 0 ? 'exited' : 'failed')
						})
					)
				)
			})
			yield* Ref.set(processRef, {data, exit, process: subprocess})
			yield* Ref.set(replayProcessRef, subprocess)
			yield* setStatus('running')

			return yield* SubscriptionRef.get(status)
		})

		const startDefaultProcess = Effect.fnUntraced(function* () {
			if (config.command !== undefined) return

			yield* pipe(
				Effect.gen(function* () {
					if (yield* Ref.get(processRef)) return
					yield* spawnProcess()
				}),
				Semaphore.withPermit(lifecycleLock),
				Effect.asVoid
			)
		})

		yield* pipe(
			Stream.fromQueue(dataQueue),
			Stream.groupedWithin(128, Duration.millis(16)),
			Stream.runForEach(items =>
				Effect.forEach(
					Array.fromIterable(items),
					output =>
						Effect.gen(function* () {
							const replayProcess = yield* Ref.get(replayProcessRef)
							if (replayProcess !== output.process) return

							for (const chunk of terminalChunks(output.data)) {
								yield* screenLock.withPermit(writeOutput(chunk))
							}
						}),
					{discard: true}
				)
			),
			Effect.forkScoped
		)

		yield* pipe(
			Stream.fromQueue(resizeQueue),
			Stream.groupedWithin(32, Duration.millis(16)),
			Stream.runForEach(items =>
				Option.match(Array.last(Array.fromIterable(items)), {
					onNone: () => Effect.void,
					onSome: size => screenLock.withPermit(resizeLocked(size))
				})
			),
			Effect.forkScoped
		)

		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				const attached = yield* Ref.get(attachedRef)
				yield* stopProcess()
				yield* Queue.shutdown(callbackQueue)
				yield* Queue.shutdown(dataQueue)
				yield* Queue.shutdown(resizeQueue)
				yield* Effect.forEach(attached, Queue.shutdown, {discard: true})
				yield* Effect.sync(() => {
					screen.dispose()
				})
			})
		)
		return {
			attach: (size: TerminalSize) =>
				Stream.unwrap(
					Effect.gen(function* () {
						yield* Effect.annotateCurrentSpan({cols: size.cols, cwd: config.cwd, rows: size.rows})
						const queue = yield* Queue.bounded<TerminalFrame>(1024)
						yield* screenLock.withPermit(resizeLocked(size))
						yield* Ref.update(attachedRef, current => Array.append(current, queue))
						yield* startDefaultProcess()
						const snapshot = yield* screenLock.withPermit(
							Effect.gen(function* () {
								const resetSequence = yield* nextSequence()
								const frames = yield* Effect.forEach(terminalChunks(serialize.serialize({scrollback: 20_000})), data =>
									Effect.map(nextSequence(), sequence => ({data, sequence, type: 'output' as const}))
								)
								return Array.prepend(frames, {sequence: resetSequence, type: 'reset' as const})
							})
						)
						yield* Effect.annotateCurrentSpan({snapshotFrameCount: Array.length(snapshot)})

						return Stream.concat(
							Stream.fromIterable(snapshot),
							Stream.fromQueue(queue).pipe(
								Stream.ensuring(
									Effect.andThen(
										Ref.update(attachedRef, current => Array.filter(current, currentQueue => currentQueue !== queue)),
										Queue.shutdown(queue)
									)
								)
							)
						)
					}).pipe(Effect.withSpan('Terminal.attach'))
				),
			resize: Effect.fn('Terminal.resize')(function* (size: TerminalSize) {
				yield* Effect.annotateCurrentSpan({cols: size.cols, cwd: config.cwd, rows: size.rows})
				const current = yield* Ref.get(sizeRef)
				if (current.cols === size.cols && current.rows === size.rows) return
				yield* Queue.offer(resizeQueue, size)
			}),
			restart: Effect.fn('Terminal.restart')(function* () {
				yield* Effect.annotateCurrentSpan({command: processCommand, cwd: config.cwd, processCwd})
				return yield* lifecycleLock.withPermit(spawnProcess())
			}),
			status,
			stop: Effect.fn('Terminal.stop')(function* () {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd})
				yield* lifecycleLock.withPermit(stopProcess('stopped'))
				return yield* SubscriptionRef.get(status)
			}),
			write: Effect.fn('Terminal.write')(function* (input: TerminalInput) {
				const data = terminalInputString(input)
				if (data === '') return

				yield* Effect.annotateCurrentSpan({byteLength: data.length, cwd: config.cwd, inputType: input.type})
				const process = yield* Ref.get(processRef)
				if (!process) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: 'failed to write to terminal'}),
					try: () => {
						process.process.write(data)
					}
				})
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
