import {Context, Duration, Effect, Layer, pipe, Queue, RcMap, Stream} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import {Terminal as HeadlessTerminal} from '@xterm/headless'

const terminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (key: string) {
		let cols = 120
		let rows = 32
		let processHandle: ReturnType<typeof Bun.spawn> | undefined
		const decoder = new TextDecoder()
		let screenParsed = Promise.resolve()
		const readySubscribers = new WeakSet<{
			readonly queue: Queue.Queue<{readonly data: string; readonly type: 'data' | 'snapshot'}>
		}>()
		const subscribers = new Set<{
			readonly queue: Queue.Queue<{readonly data: string; readonly type: 'data' | 'snapshot'}>
		}>()
		const screen = new HeadlessTerminal({allowProposedApi: true, cols, rows, scrollback: 10_000})
		const serialize = new SerializeAddon()
		screen.loadAddon(serialize)
		const waitForScreen = Effect.promise(async () => {
			let parsed: Promise<void>
			while (true) {
				parsed = screenParsed
				await parsed
				if (parsed === screenParsed) return
			}
		})

		yield* Effect.forkScoped(
			Effect.forever(
				Effect.gen(function* () {
					const subprocess = yield* Effect.acquireRelease(
						Effect.sync(() => {
							const subprocess = Bun.spawn([process.env['SHELL'] ?? 'bash'], {
								cwd: key.split('\u0000')[1] ?? '',
								env: {...process.env, TERM: 'xterm-256color'},
								terminal: {
									cols,
									data: (_terminal, data) => {
										const text = decoder.decode(data, {stream: true})
										screenParsed = new Promise(resolve => {
											screen.write(text, resolve)
										})
										for (const subscriber of subscribers) {
											if (readySubscribers.has(subscriber)) {
												Queue.offerUnsafe(subscriber.queue, {data: text, type: 'data'})
											}
										}
									},
									rows
								}
							})
							processHandle = subprocess
							return subprocess
						}),
						subprocess => {
							return Effect.sync(() => {
								if (processHandle === subprocess) processHandle = undefined
								subprocess.kill()
							})
						}
					)

					yield* Effect.promise(() => subprocess.exited)
					yield* Effect.sleep(Duration.millis(250))
				})
			)
		)

		const shutdown = Effect.sync(() => {
			decoder.decode()
		})

		yield* Effect.addFinalizer(() => shutdown)

		return {
			events: Stream.scoped(
				Stream.unwrap(
					pipe(
						Effect.acquireRelease(
							pipe(
								Queue.unbounded<{readonly data: string; readonly type: 'data' | 'snapshot'}>(),
								Effect.tap(() => waitForScreen),
								Effect.map(queue => {
									const subscriber = {queue} as const
									subscribers.add(subscriber)
									Queue.offerUnsafe(subscriber.queue, {
										data: serialize.serialize({scrollback: 10_000}),
										type: 'snapshot'
									})
									readySubscribers.add(subscriber)
									return subscriber
								})
							),
							subscriber => {
								return Effect.all(
									[
										Effect.sync(() => {
											subscribers.delete(subscriber)
										}),
										Queue.shutdown(subscriber.queue)
									],
									{discard: true}
								)
							}
						),
						Effect.map(subscriber => Stream.fromQueue(subscriber.queue))
					)
				)
			),
			resize: (nextSize: {readonly cols: number; readonly rows: number}) => {
				return Effect.sync(() => {
					if (nextSize.cols === cols && nextSize.rows === rows) return
					cols = nextSize.cols
					rows = nextSize.rows
					screen.resize(cols, rows)
					processHandle?.terminal?.resize?.(cols, rows)
				})
			},
			write: (data: string) => Effect.sync(() => processHandle?.terminal?.write(data))
		}
	})
})

export class Terminal extends Context.Service<Terminal>()('@ai-toolkit/terminal/service/Terminal', {
	make: Effect.gen(function* () {
		const sessions = yield* terminalSessions

		return {
			events: (input: {readonly cwd: string; readonly id: string}) => {
				return Stream.unwrap(
					pipe(
						RcMap.get(sessions, `${input.id}\u0000${input.cwd}`),
						Effect.map(session => session.events)
					)
				)
			},
			resize: (input: {readonly cols: number; readonly cwd: string; readonly id: string; readonly rows: number}) => {
				return Effect.scoped(
					Effect.gen(function* () {
						const session = yield* RcMap.get(sessions, `${input.id}\u0000${input.cwd}`)
						yield* session.resize({cols: input.cols, rows: input.rows})
					})
				)
			},
			write: (input: {readonly cwd: string; readonly data: string; readonly id: string}) => {
				return Effect.scoped(
					Effect.gen(function* () {
						const session = yield* RcMap.get(sessions, `${input.id}\u0000${input.cwd}`)
						yield* session.write(input.data)
					})
				)
			}
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
