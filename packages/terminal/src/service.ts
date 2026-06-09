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
	ScopedRef,
	Stream,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import * as nodePty from '@lydell/node-pty'
import type {IPty} from '@lydell/node-pty'
import {SerializeAddon} from '@xterm/addon-serialize'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import headless from '@xterm/headless'
import type {ChildProcess} from 'effect/unstable/process'

import {terminalChunks, terminalOscUpdates, terminalReset, terminalTitleStatus} from './model.ts'
import type {TerminalAttachUpdate, TerminalStatus} from './schema.ts'
import {TerminalError, terminalStatusActive} from './schema.ts'

type RunningProcess = {
	readonly data: {readonly dispose: () => void}
	readonly exit: {readonly dispose: () => void}
	readonly process: IPty
}

type TerminalSize = {readonly cols: number; readonly rows: number}
type QueuedOutput = {readonly data: string; readonly process: IPty}

const terminalScrollback = 5_000
const {Terminal: HeadlessTerminal} = headless

function makeSnapshotState(size: TerminalSize) {
	return Effect.acquireRelease(
		Effect.sync(() => {
			const terminal = new HeadlessTerminal({
				allowProposedApi: true,
				cols: size.cols,
				rows: size.rows,
				scrollback: terminalScrollback
			})
			const serialize = new SerializeAddon()
			terminal.loadAddon(new Unicode11Addon())
			terminal.unicode.activeVersion = '11'
			terminal.loadAddon(serialize)

			return {serialize, terminal}
		}),
		state =>
			Effect.sync(() => {
				state.serialize.dispose()
				state.terminal.dispose()
			})
	)
}

export class Terminal extends Context.Service<Terminal>()('@deslop/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {readonly command?: ChildProcess.StandardCommand; readonly cwd: string}) {
		const dataQueue = yield* Queue.bounded<QueuedOutput>(128)
		const resizeQueue = yield* Queue.sliding<TerminalSize>(1)
		const lifecycleLock = yield* Semaphore.make(1)
		const processRef = yield* Ref.make<RunningProcess | undefined>(void 0)
		const replayProcessRef = yield* Ref.make<IPty | undefined>(void 0)
		const sizeRef = yield* Ref.make<TerminalSize>({cols: 120, rows: 32})
		const snapshotRef = yield* ScopedRef.fromAcquire(makeSnapshotState({cols: 120, rows: 32}))
		const oscRef = yield* Ref.make('')
		const attachRef = yield* Ref.make<Queue.Enqueue<TerminalAttachUpdate, Cause.Done> | undefined>(void 0)
		const shell = yield* Config.string('SHELL').pipe(Effect.orElseSucceed(() => 'bash'))
		const processCommand = config.command?.command ?? shell
		const processArgs = config.command?.args ?? []
		const processEnv = config.command?.options.env ?? {}
		const autostart = config.command === undefined
		const statusRef = yield* SubscriptionRef.make<TerminalStatus>({state: autostart ? 'starting' : 'idle', title: ''})

		const publishStatus = Effect.fnUntraced(function* (status: TerminalStatus) {
			const previous = yield* SubscriptionRef.getAndUpdateSome(statusRef, current =>
				current.state === status.state && current.title === status.title ? Option.none() : Option.some(status)
			)
			if (previous.state === status.state && previous.title === status.title) return

			const attach = yield* Ref.get(attachRef)
			if (attach) yield* Queue.offer(attach, {status, type: 'status' as const})
		})

		function setStatus(state: TerminalStatus['state']) {
			return SubscriptionRef.get(statusRef).pipe(Effect.flatMap(current => publishStatus({...current, state})))
		}

		function setTitle(title: string) {
			return SubscriptionRef.get(statusRef).pipe(
				Effect.flatMap(current => {
					if (!terminalStatusActive(current.state)) return Effect.void
					return publishStatus({...current, ...terminalTitleStatus(title)})
				})
			)
		}

		function setProgress(state: TerminalStatus['state']) {
			return SubscriptionRef.get(statusRef).pipe(
				Effect.flatMap(current =>
					terminalStatusActive(current.state) ? publishStatus({...current, state}) : Effect.void
				)
			)
		}

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
			yield* ScopedRef.set(snapshotRef, makeSnapshotState(yield* Ref.get(sizeRef)))
			yield* Ref.set(oscRef, '')
			yield* publishStatus({state: 'starting', title: ''})
			const attach = yield* Ref.get(attachRef)
			if (attach) yield* Queue.offer(attach, {data: terminalReset, type: 'data' as const})

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
			const data = subprocess.onData(chunk => {
				const output = {data: chunk, process: subprocess}
				if (Queue.offerUnsafe(dataQueue, output)) return

				if ('pause' in subprocess && typeof subprocess.pause === 'function') subprocess.pause()
				Effect.runFork(
					Queue.offer(dataQueue, output).pipe(
						Effect.andThen(
							Effect.sync(() => {
								if ('resume' in subprocess && typeof subprocess.resume === 'function') subprocess.resume()
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

			return yield* SubscriptionRef.get(statusRef)
		})

		const resizeProcess = Effect.fnUntraced(function* (nextSize: TerminalSize) {
			const size = yield* Ref.get(sizeRef)
			if (size.cols === nextSize.cols && size.rows === nextSize.rows) return

			yield* Ref.set(sizeRef, nextSize)
			const snapshot = yield* ScopedRef.get(snapshotRef)
			yield* Effect.sync(() => {
				snapshot.terminal.resize(nextSize.cols, nextSize.rows)
			})
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

							const snapshot = yield* ScopedRef.get(snapshotRef)
							for (const chunk of terminalChunks(output.data)) {
								yield* Effect.callback<true>(resume => {
									snapshot.terminal.write(chunk, () => resume(Effect.succeed(true)))
								})
								const updates = yield* Ref.modify(oscRef, carry => {
									const parsed = terminalOscUpdates(chunk, carry)
									return [parsed.updates, parsed.carry] as const
								})
								for (const update of updates) {
									yield* update.type === 'title' ? setTitle(update.title) : setProgress(update.state)
								}
								const attach = yield* Ref.get(attachRef)
								if (attach) yield* Queue.offer(attach, {data: chunk, type: 'data' as const})
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
			Effect.all(
				[
					stopProcess(),
					Queue.shutdown(dataQueue),
					Queue.shutdown(resizeQueue),
					Ref.get(attachRef).pipe(Effect.flatMap(queue => (queue ? Queue.end(queue) : Effect.void)))
				],
				{concurrency: 'unbounded', discard: true}
			)
		)
		if (autostart) {
			yield* pipe(
				spawnProcess(),
				Semaphore.withPermit(lifecycleLock),
				Effect.catch(() => setStatus('failed'))
			)
		}

		const attachQueue = Effect.gen(function* () {
			const previous = yield* Ref.get(attachRef)
			const queue = yield* Queue.bounded<TerminalAttachUpdate, Cause.Done>(128)
			yield* Queue.offer(queue, {status: yield* SubscriptionRef.get(statusRef), type: 'status' as const})
			const snapshot = yield* ScopedRef.get(snapshotRef)
			yield* Queue.offer(queue, {data: snapshot.serialize.serialize(), type: 'snapshot' as const})
			yield* Ref.set(attachRef, queue)
			if (previous) yield* Queue.end(previous)
			yield* Effect.addFinalizer(() =>
				Ref.update(attachRef, current => (current === queue ? undefined : current)).pipe(
					Effect.andThen(Queue.end(queue))
				)
			)

			return queue
		})

		const statusQueue = Effect.gen(function* () {
			const queue = yield* Queue.sliding<TerminalStatus, Cause.Done>(1)
			yield* Effect.addFinalizer(() => Queue.end(queue))
			yield* Queue.offer(queue, yield* SubscriptionRef.get(statusRef))
			yield* pipe(
				SubscriptionRef.changes(statusRef),
				Stream.drop(1),
				Stream.groupedWithin(32, Duration.millis(250)),
				Stream.runForEach(items =>
					pipe(
						Array.last(Array.fromIterable(items)),
						Option.match({onNone: () => Effect.void, onSome: status => Queue.offer(queue, status)})
					)
				),
				Effect.forkScoped
			)

			return queue
		})

		return {
			attachQueue,
			resize: Effect.fnUntraced(function* (size: TerminalSize) {
				yield* Queue.offer(resizeQueue, size)
			}),
			restart: Effect.fnUntraced(function* () {
				return yield* pipe(
					spawnProcess(),
					Semaphore.withPermit(lifecycleLock),
					Effect.catch(() => pipe(setStatus('failed'), Effect.andThen(SubscriptionRef.get(statusRef))))
				)
			}),
			statusQueue,
			stop: Effect.fnUntraced(function* () {
				yield* pipe(stopProcess('stopped'), Semaphore.withPermit(lifecycleLock))
				return yield* SubscriptionRef.get(statusRef)
			}),
			write: Effect.fnUntraced(function* (data: string) {
				if (data === '') return

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
