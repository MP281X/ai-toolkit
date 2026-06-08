import {Cause, Context, Effect, Layer, Queue, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import {Terminal} from './service.ts'

describe('@deslop/terminal service', () => {
	it('preserves a burst of PTY output through replay', async () => {
		const snapshot = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make('sh', [
								'-lc',
								'printf start; i=0; while [ "$i" -lt 5000 ]; do printf x; i=$((i + 1)); done; printf end'
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					yield* Effect.sleep('1 second')
					const updates = yield* terminal.attachQueue
					yield* Queue.take(updates)
					return yield* pipe(
						Queue.take(updates),
						Effect.map(update => (update.type === 'snapshot' ? update.data : ''))
					)
				})
			)
		)

		expect(snapshot).toContain('start')
		expect(snapshot).toContain('end')
		expect(snapshot.length).toBeGreaterThan(5_000)
	})

	it('replays bounded terminal output to a fresh attach queue', async () => {
		const snapshot = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({command: ChildProcess.make('sh', ['-lc', 'printf terminal-ready']), cwd: process.cwd()}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					yield* Effect.sleep('100 millis')
					const updates = yield* terminal.attachQueue
					yield* Queue.take(updates)
					return yield* pipe(
						Queue.take(updates),
						Effect.map(update => (update.type === 'snapshot' ? update.data : ''))
					)
				})
			)
		)

		expect(snapshot).toContain('terminal-ready')
	})

	it('ends the previous attach queue when a new viewer attaches', async () => {
		const ended = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({command: ChildProcess.make('sh', ['-lc', 'printf terminal-ready']), cwd: process.cwd()}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					const first = yield* terminal.attachQueue
					yield* terminal.attachQueue
					yield* Queue.take(first)
					yield* Queue.take(first)
					return Cause.isDone(yield* Effect.flip(Queue.take(first)))
				})
			)
		)

		expect(ended).toBe(true)
	})
})
