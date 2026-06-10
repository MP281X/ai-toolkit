import type {Cause} from 'effect'
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
import type {ChildProcess} from 'effect/unstable/process'

import {terminalChunks, terminalOscUpdates, terminalTitleStatus} from './model.ts'
import type {TerminalCursor, TerminalFrame, TerminalInput, TerminalSize, TerminalStatus} from './schema.ts'
import {TerminalError, terminalStatusActive} from './schema.ts'

type RunningProcess = {
	readonly data: {readonly dispose: () => void}
	readonly exit: {readonly dispose: () => void}
	readonly process: IPty
}

type QueuedOutput = {readonly data: string; readonly process: IPty}
type AttachQueue = Queue.Queue<TerminalFrame, Cause.Done>
type Transcript = {
	readonly attached: readonly AttachQueue[]
	readonly cursor: TerminalCursor
	readonly frames: readonly TerminalFrame[]
}
type TerminalFrameBody =
	| {readonly data: string; readonly type: 'output'}
	| {readonly size: TerminalSize; readonly type: 'resize'}
type TerminalMock = {
	readonly frames?: readonly TerminalFrame[]
	readonly resize?: (size: TerminalSize) => Effect.Effect<void>
	readonly status?: TerminalStatus
	readonly write?: (input: TerminalInput) => Effect.Effect<void, TerminalError>
}

const terminalScrollbackLines = 5_000
const terminalDataQueueCapacity = 128
const terminalDataQueueLowWater = 32

function nextCursor(cursor: TerminalCursor): TerminalCursor {
	return {epoch: cursor.epoch, sequence: cursor.sequence + 1}
}

function newlineCount(value: string) {
	let count = 0
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) === 10) count += 1
	}
	return count
}

function retainTranscript(frames: readonly TerminalFrame[]) {
	let lines = 0
	let index = frames.length

	while (index > 0 && lines < terminalScrollbackLines) {
		index -= 1
		const frame = frames[index]
		if (frame?.type === 'output') lines += newlineCount(frame.data)
		if (frame?.type === 'reset') break
	}

	return Array.drop(frames, index)
}

function framesAfterCursor(frames: readonly TerminalFrame[], cursor?: TerminalCursor) {
	if (cursor === undefined) return frames

	const firstFrame = frames[0]
	if (firstFrame === undefined) return frames
	if (firstFrame.cursor.epoch !== cursor.epoch || firstFrame.cursor.sequence > cursor.sequence + 1) return frames

	return Array.dropWhile(frames, frame => frame.cursor.epoch < cursor.epoch || frame.cursor.sequence <= cursor.sequence)
}

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
		const dataQueue = yield* Queue.bounded<QueuedOutput>(terminalDataQueueCapacity)
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const lifecycleLock = yield* Semaphore.make(1)
		const processRef = yield* Ref.make<RunningProcess | undefined>(void 0)
		const replayProcessRef = yield* Ref.make<IPty | undefined>(void 0)
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const oscRef = yield* Ref.make('')
		const transcriptRef = yield* Ref.make<Transcript>({attached: [], cursor: {epoch: 0, sequence: 0}, frames: []})
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command?.command ?? shell
		const processArgs = config.command?.args ?? []
		const processEnv = config.command?.options.env ?? {}
		const processCwd = config.command?.options.cwd ?? config.cwd
		const autostart = config.command === undefined
		const status = yield* SubscriptionRef.make<TerminalStatus>({state: autostart ? 'starting' : 'idle', title: ''})

		const publishFrame = Effect.fnUntraced(function* (frame: TerminalFrameBody) {
			const next = yield* Ref.modify(transcriptRef, current => {
				const cursor = nextCursor(current.cursor)
				const output: TerminalFrame =
					frame.type === 'output'
						? {cursor, data: frame.data, type: 'output'}
						: {cursor, size: frame.size, type: 'resize'}

				return [
					{attached: current.attached, frame: output},
					{...current, cursor, frames: retainTranscript(Array.append(current.frames, output))}
				] as const
			})
			const dropped = yield* Effect.sync(() => next.attached.filter(queue => !Queue.offerUnsafe(queue, next.frame)))
			if (Array.isReadonlyArrayNonEmpty(dropped)) {
				yield* Ref.update(transcriptRef, current => ({
					...current,
					attached: Array.filter(current.attached, queue => !dropped.includes(queue))
				}))
				yield* Effect.forEach(dropped, Queue.shutdown, {discard: true})
			}
		})

		const resetTranscript = Effect.fnUntraced(function* () {
			const next = yield* Ref.modify(transcriptRef, current => {
				const cursor = {epoch: current.cursor.epoch + 1, sequence: 0}
				const frame = {cursor, type: 'reset' as const}

				return [
					{attached: current.attached, frame},
					{...current, cursor, frames: [frame]}
				] as const
			})
			const dropped = yield* Effect.sync(() => next.attached.filter(queue => !Queue.offerUnsafe(queue, next.frame)))
			if (Array.isReadonlyArrayNonEmpty(dropped)) {
				yield* Ref.update(transcriptRef, current => ({
					...current,
					attached: Array.filter(current.attached, queue => !dropped.includes(queue))
				}))
				yield* Effect.forEach(dropped, Queue.shutdown, {discard: true})
			}
		})

		const publishStatus = Effect.fnUntraced(function* (nextStatus: TerminalStatus) {
			yield* SubscriptionRef.getAndUpdateSome(status, current =>
				current.state === nextStatus.state && current.title === nextStatus.title
					? Option.none()
					: Option.some(nextStatus)
			)
		})

		function setStatus(state: TerminalStatus['state']) {
			return SubscriptionRef.get(status).pipe(Effect.flatMap(current => publishStatus({...current, state})))
		}

		function setTitle(title: string) {
			return SubscriptionRef.get(status).pipe(
				Effect.flatMap(current => {
					if (!terminalStatusActive(current.state)) return Effect.void
					return publishStatus({...current, ...terminalTitleStatus(title)})
				})
			)
		}

		function setProgress(state: TerminalStatus['state']) {
			return SubscriptionRef.get(status).pipe(
				Effect.flatMap(current =>
					terminalStatusActive(current.state) ? publishStatus({...current, state}) : Effect.void
				)
			)
		}

		const waitForDataQueueDrain = Effect.fnUntraced(function* () {
			while ((yield* Queue.size(dataQueue)) > terminalDataQueueLowWater) {
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
			yield* Effect.sync(() => handle.process.kill('SIGTERM')).pipe(Effect.ignore)
			yield* Effect.sleep('250 millis')
			yield* Effect.sync(() => handle.process.kill('SIGKILL')).pipe(Effect.ignore)
			if (state) yield* setStatus(state)
		})

		const spawnProcess = Effect.fnUntraced(function* () {
			yield* stopProcess()
			yield* Ref.set(replayProcessRef, undefined)
			yield* Ref.set(oscRef, '')
			yield* resetTranscript()
			yield* publishStatus({state: 'starting', title: ''})

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
			const pendingBackpressure: QueuedOutput[] = []
			let backpressureDraining = false
			const drainBackpressure = Effect.fnUntraced(function* () {
				while (pendingBackpressure.length > 0) {
					const next = pendingBackpressure.shift()
					if (next !== undefined) yield* Queue.offer(dataQueue, next)
				}
				yield* waitForDataQueueDrain()
			})
			const data = subprocess.onData(chunk => {
				const output = {data: chunk, process: subprocess}
				if (Queue.offerUnsafe(dataQueue, output)) return

				pendingBackpressure.push(output)
				if (backpressureDraining) return

				backpressureDraining = true
				pauseProcess(subprocess)
				Effect.runFork(
					drainBackpressure().pipe(
						Effect.ensuring(
							Effect.sync(() => {
								backpressureDraining = false
								resumeProcess(subprocess)
							})
						)
					)
				)
			})
			const exit = subprocess.onExit(event => {
				Effect.runFork(
					Semaphore.withPermit(
						lifecycleLock,
						Effect.gen(function* () {
							const current = yield* Ref.get(processRef)
							if (current !== handle) return

							yield* Ref.update(processRef, value => (value === handle ? undefined : value))
							if (autostart) {
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
			yield* Ref.set(processRef, handle)
			yield* Ref.set(replayProcessRef, subprocess)
			yield* setStatus('running')

			return yield* SubscriptionRef.get(status)
		})

		const resizeProcess = Effect.fnUntraced(function* (nextSize: TerminalSize) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)
			yield* publishFrame({size: nextSize, type: 'resize'})
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
								const updates = yield* Ref.modify(oscRef, carry => {
									const parsed = terminalOscUpdates(chunk, carry)
									return [parsed.updates, parsed.carry] as const
								})
								for (const update of updates) {
									yield* update.type === 'title' ? setTitle(update.title) : setProgress(update.state)
								}
								yield* publishFrame({data: chunk, type: 'output'})
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
				pipe(Array.last(Array.fromIterable(items)), Option.match({onNone: () => Effect.void, onSome: resizeProcess}))
			),
			Effect.forkScoped
		)

		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				const attached = yield* Ref.get(transcriptRef).pipe(Effect.map(transcript => transcript.attached))
				yield* Effect.all(
					[
						stopProcess(),
						Queue.shutdown(dataQueue),
						Queue.shutdown(resizeQueue),
						...Array.map(attached, Queue.shutdown)
					],
					{concurrency: 'unbounded', discard: true}
				)
			})
		)
		if (autostart) {
			yield* pipe(
				spawnProcess(),
				Semaphore.withPermit(lifecycleLock),
				Effect.catch(() => setStatus('failed'))
			)
		}

		return {
			attach: (cursor?: TerminalCursor) =>
				Stream.unwrap(
					Effect.gen(function* () {
						yield* Effect.annotateCurrentSpan({
							cursorEpoch: cursor?.epoch ?? -1,
							cursorSequence: cursor?.sequence ?? -1,
							cwd: config.cwd
						})
						const queue = yield* Queue.bounded<TerminalFrame, Cause.Done>(1024)
						const replay = yield* Ref.modify(transcriptRef, current => [
							framesAfterCursor(current.frames, cursor),
							{...current, attached: Array.append(current.attached, queue)}
						])
						yield* Effect.annotateCurrentSpan({replayFrameCount: Array.length(replay)})

						return pipe(
							Stream.fromIterable(replay),
							Stream.concat(
								Stream.fromQueue(queue).pipe(
									Stream.ensuring(
										pipe(
											Ref.update(transcriptRef, current => ({
												...current,
												attached: Array.filter(current.attached, currentQueue => currentQueue !== queue)
											})),
											Effect.andThen(Queue.shutdown(queue))
										)
									)
								)
							)
						)
					}).pipe(Effect.withSpan('Terminal.attach'))
				),
			resize: Effect.fn('Terminal.resize')(function* (size: TerminalSize) {
				yield* Effect.annotateCurrentSpan({cols: size.cols, cwd: config.cwd, rows: size.rows})
				yield* Queue.offer(resizeQueue, size)
			}),
			restart: Effect.fn('Terminal.restart')(function* () {
				yield* Effect.annotateCurrentSpan({command: processCommand, cwd: config.cwd, processCwd})
				return yield* pipe(
					spawnProcess(),
					Semaphore.withPermit(lifecycleLock),
					Effect.catch(() => pipe(setStatus('failed'), Effect.andThen(SubscriptionRef.get(status))))
				)
			}),
			status,
			stop: Effect.fn('Terminal.stop')(function* () {
				yield* Effect.annotateCurrentSpan({cwd: config.cwd})
				yield* pipe(stopProcess('stopped'), Semaphore.withPermit(lifecycleLock))
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
	public static layerMock(input: TerminalMock = {}) {
		return Layer.effect(
			this,
			Effect.gen(function* () {
				const status = yield* SubscriptionRef.make<TerminalStatus>(input.status ?? {state: 'idle', title: ''})

				return {
					attach: (cursor?: TerminalCursor) => Stream.fromIterable(framesAfterCursor(input.frames ?? [], cursor)),
					resize: Effect.fn('Terminal.mock.resize')(function* (size: TerminalSize) {
						if (input.resize !== undefined) yield* input.resize(size)
					}),
					restart: Effect.fn('Terminal.mock.restart')(function* () {
						const next = {state: 'running' as const, title: ''}
						yield* SubscriptionRef.set(status, next)
						return next
					}),
					status,
					stop: Effect.fn('Terminal.mock.stop')(function* () {
						const next = {state: 'stopped' as const, title: ''}
						yield* SubscriptionRef.set(status, next)
						return next
					}),
					write: Effect.fn('Terminal.mock.write')(function* (data: TerminalInput) {
						if (input.write !== undefined) yield* input.write(data)
					})
				}
			})
		)
	}
}
