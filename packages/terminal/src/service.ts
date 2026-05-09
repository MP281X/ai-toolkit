import {Context, Effect, flow, Layer, pipe, Queue, Stream} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import {Terminal as HeadlessTerminal} from '@xterm/headless'

import type {TerminalEvent} from './schema.ts'
import {TerminalError} from './schema.ts'

export class Terminal extends Context.Service<Terminal>()('@ai-toolkit/terminal/service/Terminal', {
	make: Effect.fnUntraced(function* (config: {readonly cwd: string}) {
		let cols = 120
		let rows = 32
		let processHandle: ReturnType<typeof Bun.spawn> | undefined
		const decoder = new TextDecoder()
		let screenParsed = Promise.resolve()
		const readySubscribers = new WeakSet<Queue.Queue<TerminalEvent>>()
		const subscribers = new Set<Queue.Queue<TerminalEvent>>()
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
						Effect.try({
							try: () => {
								const subprocess = Bun.spawn([process.env['SHELL'] ?? 'bash'], {
									cwd: config.cwd,
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
													Queue.offerUnsafe(subscriber, {data: text, type: 'data'})
												}
											}
										},
										rows
									}
								})
								processHandle = subprocess
								return subprocess
							},
							catch: cause => new TerminalError({message: `failed to spawn terminal in ${config.cwd}`, cause})
						}),
						subprocess => {
							return Effect.sync(() => {
								if (processHandle === subprocess) processHandle = undefined
								subprocess.kill()
							})
						}
					)

					yield* Effect.promise(() => subprocess.exited)
					yield* Effect.sleep('250 millis')
				})
			)
		)

		yield* Effect.addFinalizer(() => Effect.sync(() => decoder.decode()))

		return {
			events: Stream.scoped(
				Stream.unwrap(
					pipe(
						Effect.acquireRelease(
							pipe(
								Queue.unbounded<TerminalEvent>(),
								Effect.tap(() => waitForScreen),
								Effect.map(queue => {
									subscribers.add(queue)
									Queue.offerUnsafe(queue, {
										data: serialize.serialize({scrollback: 10_000}),
										type: 'snapshot'
									})
									readySubscribers.add(queue)
									return queue
								})
							),
							subscriber => {
								return Effect.all(
									[
										Effect.sync(() => {
											subscribers.delete(subscriber)
										}),
										Queue.shutdown(subscriber)
									],
									{discard: true}
								)
							}
						),
						Effect.map(Stream.fromQueue)
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
}) {
	static layer = flow(this.make, Layer.effect(this))
}
