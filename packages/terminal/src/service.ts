import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	Layer,
	Option,
	Queue,
	Record,
	Ref,
	Semaphore,
	Stream,
	String,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import * as nodePty from '@lydell/node-pty'
import type {ChildProcess} from 'effect/unstable/process'

import {
	appendTerminalHistory,
	emptyTerminalHistory,
	terminalChunks,
	terminalOscUpdates,
	terminalTitleStatus
} from './model.ts'
import type {TerminalFrame, TerminalInput, TerminalSize} from './schema.ts'
import {TerminalError, TerminalStatus, terminalStatusActive} from './schema.ts'

interface TerminalSubprocess {
	readonly kill: (signal?: string) => void
	readonly onData: (callback: (chunk: string) => void) => {readonly dispose: () => void}
	readonly onExit: (callback: (event: {readonly exitCode: number}) => void) => {readonly dispose: () => void}
	readonly pause?: () => void
	readonly resize: (cols: number, rows: number) => void
	readonly resume?: () => void
	readonly write: (data: string) => void
}

class TerminalProcessState {
	public backlog = Array.empty<string>()
	public backlogBytes = 0
	public exited = false
	public pendingExitCode: number | undefined
	public paused = false
	public queuedBytes = 0
	public readonly data: {readonly dispose: () => void}
	public readonly exit: {readonly dispose: () => void}
	public readonly id: number
	public readonly process: TerminalSubprocess

	public constructor(input: {
		readonly data: {readonly dispose: () => void}
		readonly exit: {readonly dispose: () => void}
		readonly id: number
		readonly process: TerminalSubprocess
	}) {
		this.data = input.data
		this.exit = input.exit
		this.id = input.id
		this.process = input.process
	}

	public enqueueOutput(
		dataQueue: Queue.Queue<
			| {readonly data: string; readonly process: TerminalProcessState; readonly type: 'output'}
			| {readonly exitCode: number; readonly process: TerminalProcessState; readonly type: 'exit'}
			| {readonly process: TerminalProcessState; readonly type: 'overflow'}
		>,
		data: string
	) {
		const bytes = Buffer.byteLength(data)
		if (Queue.offerUnsafe(dataQueue, {data, process: this, type: 'output'})) {
			this.queuedBytes += bytes
		} else {
			this.backlog = Array.append(this.backlog, data)
			this.backlogBytes += bytes
		}

		if (!this.paused && this.queuedBytes + this.backlogBytes >= 2 * 1024 * 1024) {
			this.paused = true
			this.process.pause?.()
		}
		while (this.backlogBytes > 8 * 1024 * 1024 && !Array.isReadonlyArrayEmpty(this.backlog)) {
			if (this.backlog[0] === undefined) break
			this.backlogBytes -= Buffer.byteLength(this.backlog[0])
			this.backlog.splice(0, 1)
			Queue.offerUnsafe(dataQueue, {process: this, type: 'overflow'})
		}
	}

	public completeOutput(data: string) {
		this.queuedBytes = Math.max(0, this.queuedBytes - Buffer.byteLength(data))
	}

	public enqueueExit(
		dataQueue: Queue.Queue<
			| {readonly data: string; readonly process: TerminalProcessState; readonly type: 'output'}
			| {readonly exitCode: number; readonly process: TerminalProcessState; readonly type: 'exit'}
			| {readonly process: TerminalProcessState; readonly type: 'overflow'}
		>,
		exitCode: number
	) {
		this.exited = true
		if (
			!Array.isReadonlyArrayEmpty(this.backlog) ||
			!Queue.offerUnsafe(dataQueue, {exitCode, process: this, type: 'exit'})
		) {
			this.pendingExitCode = exitCode
		}
	}

	public drainBacklog(
		dataQueue: Queue.Queue<
			| {readonly data: string; readonly process: TerminalProcessState; readonly type: 'output'}
			| {readonly exitCode: number; readonly process: TerminalProcessState; readonly type: 'exit'}
			| {readonly process: TerminalProcessState; readonly type: 'overflow'}
		>
	) {
		while (!Array.isReadonlyArrayEmpty(this.backlog)) {
			if (this.backlog[0] === undefined) break
			if (!Queue.offerUnsafe(dataQueue, {data: this.backlog[0], process: this, type: 'output'})) break

			this.queuedBytes += Buffer.byteLength(this.backlog[0])
			this.backlogBytes -= Buffer.byteLength(this.backlog[0])
			this.backlog.splice(0, 1)
		}
		this.flushExit(dataQueue)
		if (this.paused && this.queuedBytes + this.backlogBytes <= 512 * 1024) {
			this.paused = false
			this.process.resume?.()
		}
	}

	public flushExit(
		dataQueue: Queue.Queue<
			| {readonly data: string; readonly process: TerminalProcessState; readonly type: 'output'}
			| {readonly exitCode: number; readonly process: TerminalProcessState; readonly type: 'exit'}
			| {readonly process: TerminalProcessState; readonly type: 'overflow'}
		>
	) {
		if (this.pendingExitCode === undefined || !Array.isReadonlyArrayEmpty(this.backlog)) return
		if (Queue.offerUnsafe(dataQueue, {exitCode: this.pendingExitCode, process: this, type: 'exit'})) {
			this.pendingExitCode = undefined
		}
	}
}

class TerminalProcessHolder {
	public current: TerminalProcessState | undefined
}

class TerminalAttachmentState {
	public overflowed = false
	public readonly queue: Queue.Queue<TerminalFrame>

	public constructor(queue: Queue.Queue<TerminalFrame>) {
		this.queue = queue
	}

	public publish(frame: TerminalFrame) {
		return Effect.flatMap(Queue.size(this.queue), size => {
			if (size > 192) {
				if (!this.overflowed) {
					this.overflowed = true
					return Effect.andThen(
						Queue.clear(this.queue),
						Effect.sync(() => {
							Queue.offerUnsafe(
								this.queue,
								frame.type === 'overflow' ? frame : {sequence: frame.sequence, type: 'overflow'}
							)
						})
					)
				}
				return Effect.void
			}

			return Effect.sync(() => {
				if (frame.type === 'reset') this.overflowed = false
				if (this.overflowed && size > 32) return
				if (this.overflowed) this.overflowed = false

				Queue.offerUnsafe(this.queue, frame)
			})
		})
	}
}

function terminalInputString(input: TerminalInput) {
	return input.type === 'text' ? input.data : new TextDecoder().decode(input.data)
}

function terminalEnvBlocked(key: string) {
	return (
		key === 'TERM_PROGRAM' ||
		key === 'TERM_PROGRAM_VERSION' ||
		key === 'VTE_VERSION' ||
		key === 'WT_SESSION' ||
		key === 'WT_PROFILE_ID' ||
		key === 'GHOSTTY_RESOURCES_DIR' ||
		key === 'GHOSTTY_SHELL_INTEGRATION_NO_SUDO' ||
		key === 'GHOSTTY_BIN_DIR' ||
		key === 'GHOSTTY_PID' ||
		key === 'TERM_SESSION_ID' ||
		String.startsWith('KITTY_')(key) ||
		String.startsWith('VSCODE_')(key)
	)
}

function terminalProcessEnv(processEnv: Readonly<{readonly [key: string]: string}>) {
	return {
		...Record.filter(
			process.env,
			(value, key): value is string => typeof value === 'string' && !terminalEnvBlocked(key)
		),
		...processEnv,
		COLORTERM: 'truecolor',
		TERM: 'xterm-256color'
	}
}

function spawnNodePty(input: {
	readonly args: readonly string[]
	readonly command: string
	readonly cwd: string
	readonly env: Readonly<{readonly [key: string]: string}>
	readonly size: TerminalSize
}) {
	return nodePty.spawn(input.command, [...input.args], {
		cols: input.size.cols,
		cwd: input.cwd,
		env: input.env,
		name: 'xterm-256color',
		rows: input.size.rows
	})
}

function killProcess(process: TerminalProcessState, signal: 'SIGKILL' | 'SIGTERM') {
	return Effect.sync(() => {
		try {
			process.process.kill(signal)
		} catch {
			// The PTY may already have exited between escalation checks.
		}
	})
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {
		readonly command?: ChildProcess.StandardCommand
		readonly cwd: string
		readonly spawn?: (input: {
			readonly args: readonly string[]
			readonly command: string
			readonly cwd: string
			readonly env: Readonly<{readonly [key: string]: string}>
			readonly size: TerminalSize
		}) => {
			readonly kill: (signal?: string) => void
			readonly onData: (callback: (chunk: string) => void) => {readonly dispose: () => void}
			readonly onExit: (callback: (event: {readonly exitCode: number}) => void) => {readonly dispose: () => void}
			readonly pause?: () => void
			readonly resize: (cols: number, rows: number) => void
			readonly resume?: () => void
			readonly write: (data: string) => void
		}
	}) {
		const dataQueue = yield* Queue.bounded<
			| {readonly data: string; readonly process: TerminalProcessState; readonly type: 'output'}
			| {readonly exitCode: number; readonly process: TerminalProcessState; readonly type: 'exit'}
			| {readonly process: TerminalProcessState; readonly type: 'overflow'}
		>(512)
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const lifecycleLock = yield* Semaphore.make(1)
		const processRef = yield* Ref.make<TerminalProcessState | undefined>(void 0)
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const oscRef = yield* Ref.make('')
		const attachedRef = yield* Ref.make<readonly TerminalAttachmentState[]>([])
		const sequenceRef = yield* Ref.make(0)
		const historyRef = yield* Ref.make(emptyTerminalHistory())
		const generationRef = yield* Ref.make(0)
		const shell = yield* Config.withDefault(Config.string('SHELL'), 'bash')
		const processCommand = config.command?.command ?? shell
		const processArgs = config.command?.args ?? []
		const processEnv = Record.filter(
			config.command?.options.env ?? {},
			(value, key): value is string => typeof value === 'string' && !terminalEnvBlocked(key)
		)
		const processCwd = config.command?.options.cwd ?? config.cwd
		const restartOnExit = config.command === undefined
		const status = yield* SubscriptionRef.make<TerminalStatus>(new TerminalStatus({state: 'idle', title: ''}))
		const spawnProcess = config.spawn ?? spawnNodePty

		const nextSequence = Effect.fnUntraced(function* () {
			return yield* Ref.modify(sequenceRef, current => [current, current + 1] as const)
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

		const publishFrame = Effect.fnUntraced(function* (frame: TerminalFrame) {
			const attached = yield* Ref.get(attachedRef)
			yield* Effect.forEach(attached, attachment => attachment.publish(frame), {discard: true})
		})

		const resetHistory = Effect.fnUntraced(function* () {
			yield* Ref.set(historyRef, emptyTerminalHistory())
			yield* Ref.set(oscRef, '')
			yield* publishFrame({sequence: yield* nextSequence(), type: 'reset'})
		})

		const writeOutput = Effect.fnUntraced(function* (chunk: string) {
			const updates = yield* Ref.modify(oscRef, carry => {
				const parsed = terminalOscUpdates(chunk, carry)
				return [parsed.updates, parsed.carry] as const
			})
			for (const update of updates) {
				yield* update.type === 'title' ? setTitle(update.title) : setProgress(update.state)
			}
			const sequence = yield* nextSequence()
			yield* Ref.update(historyRef, history => appendTerminalHistory(history, chunk, sequence))
			yield* publishFrame({data: chunk, sequence, type: 'output'})
		})

		const resizeLocked = Effect.fnUntraced(function* (nextSize: TerminalSize) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)
			const current = yield* Ref.get(processRef)
			if (!current) return
			yield* Effect.try({
				catch: cause => new TerminalError({cause, message: 'failed to resize terminal'}),
				try: () => {
					current.process.resize(nextSize.cols, nextSize.rows)
				}
			})
		})

		const stopProcess = Effect.fnUntraced(function* (state?: TerminalStatus['state']) {
			const current = yield* Ref.get(processRef)
			if (!current) {
				if (state) yield* setStatus(state)
				return
			}

			yield* Effect.sync(() => {
				current.data.dispose()
			})
			yield* Ref.update(processRef, value => (value === current ? undefined : value))
			yield* killProcess(current, 'SIGTERM')
			yield* Effect.sleep('250 millis')
			if (!current.exited) yield* killProcess(current, 'SIGKILL')
			yield* Effect.sync(() => {
				current.exit.dispose()
			})
			if (state) yield* setStatus(state)
		})

		const startProcess = Effect.fnUntraced(function* () {
			yield* stopProcess()
			yield* resetHistory()
			yield* publishStatus(new TerminalStatus({state: 'starting', title: ''}))

			const size = yield* Ref.get(sizeRef)
			const id = yield* Ref.updateAndGet(generationRef, current => current + 1)
			const subprocess = yield* Effect.try({
				catch: cause => new TerminalError({cause, message: `failed to spawn terminal in ${config.cwd}`}),
				try: () =>
					spawnProcess({
						args: processArgs,
						command: processCommand,
						cwd: processCwd,
						env: terminalProcessEnv(processEnv),
						size
					})
			})
			const holder = new TerminalProcessHolder()
			const processState = new TerminalProcessState({
				data: subprocess.onData(chunk => {
					if (holder.current === undefined) return
					for (const data of terminalChunks(chunk)) {
						holder.current.enqueueOutput(dataQueue, data)
					}
				}),
				exit: subprocess.onExit(event => {
					holder.current?.enqueueExit(dataQueue, event.exitCode)
				}),
				id,
				process: subprocess
			})
			holder.current = processState
			yield* Ref.set(processRef, processState)
			yield* setStatus('running')

			return yield* SubscriptionRef.get(status)
		})

		const startDefaultProcess = Effect.fnUntraced(function* (size: TerminalSize) {
			if (config.command !== undefined) return
			yield* lifecycleLock.withPermit(
				Effect.gen(function* () {
					if (yield* Ref.get(processRef)) return
					yield* resizeLocked(size)
					yield* startProcess()
				})
			)
		})

		yield* pipe(
			Stream.fromQueue(dataQueue),
			Stream.groupedWithin(64, Duration.millis(16)),
			Stream.runForEach(items =>
				Effect.forEach(
					Array.fromIterable(items),
					item =>
						Effect.gen(function* () {
							const current = yield* Ref.get(processRef)
							if (current !== item.process) return
							if (item.type === 'overflow') {
								yield* publishFrame({sequence: yield* nextSequence(), type: 'overflow'})
								item.process.drainBacklog(dataQueue)
								return
							}
							if (item.type === 'exit') {
								yield* Ref.update(processRef, value => (value === item.process ? undefined : value))
								yield* Effect.sync(() => {
									item.process.data.dispose()
									item.process.exit.dispose()
								})
								if (restartOnExit) {
									yield* Effect.andThen(
										Effect.sleep('1 second'),
										lifecycleLock.withPermit(
											Effect.gen(function* () {
												if ((yield* Ref.get(generationRef)) !== item.process.id) return
												if ((yield* Ref.get(processRef)) !== undefined) return
												if ((yield* SubscriptionRef.get(status)).state === 'stopped') return
												yield* startProcess()
											})
										)
									)
								} else {
									yield* setStatus(item.exitCode === 0 ? 'exited' : 'failed')
								}
								return
							}

							item.process.completeOutput(item.data)
							yield* writeOutput(item.data)
							item.process.drainBacklog(dataQueue)
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
				Option.match(Array.last(Array.fromIterable(items)), {onNone: () => Effect.void, onSome: resizeLocked})
			),
			Effect.forkScoped
		)

		yield* Effect.addFinalizer(() =>
			Effect.gen(function* () {
				const attached = yield* Ref.get(attachedRef)
				yield* stopProcess()
				yield* Queue.shutdown(dataQueue)
				yield* Queue.shutdown(resizeQueue)
				yield* Effect.forEach(attached, attachment => Queue.shutdown(attachment.queue), {discard: true})
			})
		)

		return {
			attach: (size: TerminalSize) =>
				Stream.unwrap(
					Effect.gen(function* () {
						yield* Effect.annotateCurrentSpan({cols: size.cols, cwd: config.cwd, rows: size.rows})
						const attachment = new TerminalAttachmentState(yield* Queue.sliding<TerminalFrame>(256))
						yield* Ref.update(attachedRef, current => Array.append(current, attachment))
						yield* startDefaultProcess(size)
						const history = yield* Ref.get(historyRef)
						const snapshot = Array.prepend(
							Array.map(history.chunks, chunk => ({
								data: chunk.data,
								sequence: chunk.sequence,
								type: 'output' as const
							})),
							{sequence: yield* nextSequence(), type: 'reset' as const}
						)
						yield* Effect.annotateCurrentSpan({snapshotFrameCount: Array.length(snapshot)})

						return Stream.concat(Stream.fromIterable(snapshot), Stream.fromQueue(attachment.queue)).pipe(
							Stream.ensuring(
								Effect.andThen(
									Ref.update(attachedRef, current =>
										Array.filter(current, currentAttachment => currentAttachment !== attachment)
									),
									Queue.shutdown(attachment.queue)
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
			restart: Effect.fn('Terminal.restart')(function* (size?: TerminalSize) {
				yield* Effect.annotateCurrentSpan({command: processCommand, cwd: config.cwd, processCwd})
				if (size !== undefined) yield* resizeLocked(size)
				return yield* lifecycleLock.withPermit(startProcess())
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
				const current = yield* Ref.get(processRef)
				if (!current) return

				yield* Effect.try({
					catch: cause => new TerminalError({cause, message: 'failed to write to terminal'}),
					try: () => {
						current.process.write(data)
					}
				})
			})
		}
	})
}) {
	public static layer = flow(this.make, Layer.effect(this))
}
