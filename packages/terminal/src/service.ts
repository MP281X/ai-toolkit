import type {Cause} from 'effect'
import {
	Array,
	Config,
	Context,
	Effect,
	Layer,
	Option,
	Predicate,
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
import type {ChildProcess} from 'effect/unstable/process'

import {terminalChunks, terminalOscUpdates, terminalScreenStore, terminalTitleStatus} from './model.ts'
import {
	TerminalError,
	terminalStatusActive,
	type TerminalFrame,
	type TerminalInput,
	type TerminalSize,
	type TerminalStatus
} from './schema.ts'

function terminalInputString(input: TerminalInput) {
	return input.type === 'text' ? input.data : new TextDecoder().decode(input.data)
}

function pauseProcess(process: IPty) {
	if ('pause' in process && Predicate.isFunction(process.pause)) process.pause()
}

function resumeProcess(process: IPty) {
	if ('resume' in process && Predicate.isFunction(process.resume)) process.resume()
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {command?: ChildProcess.StandardCommand; cwd: string}) {
		const dataQueue = yield* Queue.bounded<{data: string; process: IPty}>(128)
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const lifecycleLock = yield* Semaphore.make(1)
		const screenLock = yield* Semaphore.make(1)
		const processRef = yield* Ref.make(
			Option.none<{data: {dispose: () => void}; exit: {dispose: () => void}; process: IPty}>()
		)
		const replayProcessRef = yield* Ref.make(Option.none<IPty>())
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const oscRef = yield* Ref.make('')
		const attachedRef = yield* Ref.make<Queue.Queue<TerminalFrame, Cause.Done>[]>([])
		const sequenceRef = yield* Ref.make(0)
		const screen = terminalScreenStore()
		const shell = yield* pipe(
			Config.string('SHELL'),
			Effect.orElseSucceed(() => 'bash')
		)
		const status = yield* SubscriptionRef.make<TerminalStatus>({state: 'idle', title: ''})
		const runFork = Effect.runForkWith(yield* Effect.context())

		const nextSequence = Effect.fnUntraced(function* () {
			return yield* Ref.modify(sequenceRef, current => [current, current + 1] as const)
		})

		const dropQueues = Effect.fnUntraced(function* (dropped: Queue.Queue<TerminalFrame, Cause.Done>[]) {
			if (!Array.isReadonlyArrayNonEmpty(dropped)) return
			yield* Ref.update(attachedRef, current => Array.filter(current, queue => !Array.contains(dropped, queue)))
			yield* Effect.forEach(dropped, Queue.shutdown, {discard: true})
		})

		const publishFrame = Effect.fnUntraced(function* (frame: TerminalFrame) {
			const attached = yield* Ref.get(attachedRef)
			const results = yield* Effect.forEach(
				attached,
				queue =>
					pipe(
						Queue.offer(queue, frame),
						Effect.map(offered => ({offered, queue}))
					),
				{concurrency: 'unbounded'}
			)
			const dropped = pipe(
				results,
				Array.filter(result => !result.offered),
				Array.map(result => result.queue)
			)
			yield* dropQueues(dropped)
		})

		const publishStatus = Effect.fnUntraced(function* (nextStatus: TerminalStatus) {
			yield* SubscriptionRef.getAndUpdate(status, current =>
				current.state === nextStatus.state && current.title === nextStatus.title ? current : nextStatus
			)
		})

		function setStatus(state: TerminalStatus['state']) {
			return pipe(
				SubscriptionRef.get(status),
				Effect.flatMap(current => publishStatus({...current, state}))
			)
		}

		function setTitle(title?: string, state?: TerminalStatus['state']) {
			return pipe(
				SubscriptionRef.get(status),
				Effect.flatMap(current => {
					if (!terminalStatusActive(current.state)) return Effect.void
					if (Predicate.isUndefined(title)) {
						return Predicate.isUndefined(state)
							? Effect.void
							: publishStatus(state === 'running' ? {...current, state} : {...current, ...terminalTitleStatus('')})
					}

					const titleStatus = terminalTitleStatus(title)
					return publishStatus(
						Predicate.isUndefined(state) ? {...current, ...titleStatus} : {...current, ...titleStatus, state}
					)
				})
			)
		}

		function setProgress(state: TerminalStatus['state']) {
			return pipe(
				SubscriptionRef.get(status),
				Effect.flatMap(current =>
					terminalStatusActive(current.state) ? publishStatus({...current, state}) : Effect.void
				)
			)
		}

		const processOutput = Effect.fnUntraced(function* (output: {data: string; process: IPty}) {
			const replayProcess = yield* Ref.get(replayProcessRef)
			if (!pipe(replayProcess, Option.contains(output.process))) return

			for (const chunk of terminalChunks(output.data)) {
				yield* pipe(writeOutput(chunk), Semaphore.withPermit(screenLock))
			}
		})

		const writeOutput = Effect.fnUntraced(function* (chunk: string) {
			const updates = yield* Ref.modify(oscRef, carry => {
				const parsed = terminalOscUpdates(chunk, carry)
				return [parsed.updates, parsed.carry] as const
			})
			for (const update of updates) {
				yield* update.type === 'title' ? setTitle(update.title, update.state) : setProgress(update.state)
			}
			yield* screen.write(chunk)
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
			const process = pipe(yield* Ref.get(processRef), Option.getOrUndefined)
			yield* Effect.try({
				catch: cause => TerminalError.make({cause, message: 'failed to resize terminal'}),
				try: () => {
					screen.resize(nextSize)
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
			if (Option.isNone(handle)) {
				if (state) yield* setStatus(state)
				return
			}

			yield* Effect.sync(() => {
				handle.value.data.dispose()
				handle.value.exit.dispose()
			})
			yield* Ref.update(
				processRef,
				Option.filter(current => current !== handle.value)
			)
			yield* pipe(
				Effect.sync(() => {
					handle.value.process.kill('SIGTERM')
				}),
				Effect.ignore
			)
			yield* Effect.sleep('250 millis')
			yield* pipe(
				Effect.sync(() => {
					handle.value.process.kill('SIGKILL')
				}),
				Effect.ignore
			)
			if (state) yield* setStatus(state)
		})

		const spawnProcess = Effect.fnUntraced(function* () {
			yield* stopProcess()
			yield* Ref.set(replayProcessRef, Option.none())
			yield* Ref.set(oscRef, '')
			yield* pipe(resetScreen(), Semaphore.withPermit(screenLock))
			yield* publishStatus({state: 'starting', title: ''})

			const size = yield* Ref.get(sizeRef)
			const subprocess = yield* Effect.try({
				catch: cause => TerminalError.make({cause, message: `failed to spawn terminal in ${config.cwd}`}),
				try: () =>
					nodePty.spawn(config.command?.command ?? shell, [...(config.command?.args ?? [])], {
						cols: size.cols,
						cwd: config.command?.options.cwd ?? config.cwd,
						env: {
							...process.env,
							...config.command?.options.env,
							SHELL_SESSIONS_DISABLE: '1',
							TERM: 'xterm-256color',
							TERM_PROGRAM: 'deslop'
						},
						name: 'xterm-256color',
						rows: size.rows
					})
			})
			const backpressureState = {draining: false, pending: Array.empty<{data: string; process: IPty}>()}
			const drainBackpressure = Effect.fnUntraced(function* () {
				while (backpressureState.pending.length > 0) {
					const next = Array.head(backpressureState.pending)
					backpressureState.pending = Array.drop(backpressureState.pending, 1)
					if (Option.isSome(next)) yield* Queue.offer(dataQueue, next.value)
				}
				yield* waitForDataQueueDrain()
			})
			const data = subprocess.onData(chunk => {
				const output = {data: chunk, process: subprocess}
				if (Queue.offerUnsafe(dataQueue, output)) return

				if (backpressureState.pending.length >= 1024) {
					runFork(pipe(stopProcess('failed'), Semaphore.withPermit(lifecycleLock), Effect.ignore))
					return
				}

				backpressureState.pending = Array.append(backpressureState.pending, output)
				if (backpressureState.draining) return

				backpressureState.draining = true
				pauseProcess(subprocess)
				runFork(
					pipe(
						drainBackpressure(),
						Effect.ensuring(
							Effect.sync(() => {
								backpressureState.draining = false
								resumeProcess(subprocess)
							})
						)
					)
				)
			})
			const exit = subprocess.onExit(event => {
				runFork(
					Semaphore.withPermit(
						lifecycleLock,
						Effect.gen(function* () {
							const current = yield* Ref.get(processRef)
							if (!pipe(current, Option.contains(handle))) return

							yield* Ref.update(
								processRef,
								Option.filter(value => value !== handle)
							)
							if (Predicate.isUndefined(config.command)) {
								yield* pipe(
									Effect.sleep('1 second'),
									Effect.andThen(spawnProcess()),
									Effect.catch(() => setStatus('failed'))
								)
								return
							}
							yield* setStatus(event.exitCode === 0 ? 'exited' : 'failed')
						})
					)
				)
			})
			const handle = {data, exit, process: subprocess}
			yield* Ref.set(processRef, Option.some(handle))
			yield* Ref.set(replayProcessRef, Option.some(subprocess))
			yield* setStatus('running')

			return yield* SubscriptionRef.get(status)
		})

		const startDefaultProcess = Effect.fnUntraced(function* () {
			if (Predicate.isNotUndefined(config.command)) return
			if (Option.isSome(yield* Ref.get(processRef))) return

			yield* pipe(
				Effect.gen(function* () {
					if (Option.isSome(yield* Ref.get(processRef))) return
					yield* spawnProcess()
				}),
				Semaphore.withPermit(lifecycleLock),
				Effect.catch(() => setStatus('failed'))
			)
		})

		yield* pipe(
			Effect.forever(
				pipe(
					Queue.takeBetween(dataQueue, 1, 128),
					Effect.flatMap(items => Effect.forEach(items, processOutput, {discard: true}))
				)
			),
			Effect.forkScoped
		)

		yield* pipe(
			Effect.forever(
				pipe(
					Queue.takeBetween(resizeQueue, 1, 32),
					Effect.flatMap(items =>
						pipe(
							Array.last(items),
							Option.match({
								onNone: () => Effect.void,
								onSome: size => pipe(resizeLocked(size), Semaphore.withPermit(screenLock))
							})
						)
					)
				)
			),
			Effect.forkScoped
		)

		const terminalFinalizer = Effect.gen(function* () {
			const attached = yield* Ref.get(attachedRef)
			yield* stopProcess()
			yield* Queue.shutdown(dataQueue)
			yield* Queue.shutdown(resizeQueue)
			yield* Effect.forEach(attached, Queue.shutdown, {discard: true})
			yield* Effect.sync(() => {
				screen.dispose()
			})
		})
		yield* Effect.addFinalizer(() => terminalFinalizer)
		return {
			attach: (size?: TerminalSize) =>
				Stream.unwrap(
					pipe(
						Effect.gen(function* () {
							yield* Effect.annotateCurrentSpan({cols: size?.cols ?? -1, cwd: config.cwd, rows: size?.rows ?? -1})
							const queue = yield* Queue.bounded<TerminalFrame, Cause.Done>(1024)
							if (Predicate.isNotUndefined(size)) yield* pipe(resizeLocked(size), Semaphore.withPermit(screenLock))
							yield* startDefaultProcess()
							const snapshot = yield* pipe(
								Effect.gen(function* () {
									const reset = {sequence: yield* nextSequence(), type: 'reset'} satisfies TerminalFrame
									const chunks = yield* Effect.sync(() => screen.snapshot())
									const frames = pipe(
										yield* Effect.forEach(chunks, data =>
											Effect.gen(function* () {
												return {data, sequence: yield* nextSequence(), type: 'output'} satisfies TerminalFrame
											})
										),
										Array.prepend(reset)
									)
									yield* Ref.update(attachedRef, current => Array.append(current, queue))
									return frames
								}),
								Semaphore.withPermit(screenLock)
							)
							yield* Effect.annotateCurrentSpan({snapshotFrameCount: Array.length(snapshot)})

							return pipe(
								Stream.fromIterable(snapshot),
								Stream.concat(
									pipe(
										Stream.fromQueue(queue),
										Stream.ensuring(
											pipe(
												Ref.update(attachedRef, current =>
													Array.filter(current, currentQueue => currentQueue !== queue)
												),
												Effect.andThen(Queue.shutdown(queue))
											)
										)
									)
								)
							)
						}),
						Effect.withSpan('Terminal.attach')
					)
				),
			resize: Effect.fn('Terminal.resize')(function* (size: TerminalSize) {
				yield* Effect.annotateCurrentSpan({cols: size.cols, cwd: config.cwd, rows: size.rows})
				yield* Queue.offer(resizeQueue, size)
			}),
			restart: Effect.gen(function* () {
				yield* Effect.annotateCurrentSpan({
					command: config.command?.command ?? shell,
					cwd: config.cwd,
					processCwd: config.command?.options.cwd ?? config.cwd
				})
				return yield* pipe(
					spawnProcess(),
					Semaphore.withPermit(lifecycleLock),
					Effect.catch(() => pipe(setStatus('failed'), Effect.andThen(SubscriptionRef.get(status))))
				)
			}),
			status,
			stop: Effect.gen(function* () {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd})
				yield* pipe(stopProcess('stopped'), Semaphore.withPermit(lifecycleLock))
				return yield* SubscriptionRef.get(status)
			}),
			write: Effect.fn('Terminal.write')(function* (input: TerminalInput) {
				const data = terminalInputString(input)
				if (data === '') return

				yield* Effect.annotateCurrentSpan({byteLength: data.length, cwd: config.cwd, inputType: input.type})
				const process = pipe(yield* Ref.get(processRef), Option.getOrUndefined)
				if (!process) return

				yield* Effect.try({
					catch: cause => TerminalError.make({cause, message: 'failed to write to terminal'}),
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
