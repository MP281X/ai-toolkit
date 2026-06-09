import {Cause, Context, Effect, Fiber, Layer, Queue, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import type {TerminalAttachUpdate} from './schema.ts'
import {Terminal} from './service.ts'

type TerminalService = typeof Terminal.Service

function collectDataUntil(
	queue: Queue.Dequeue<TerminalAttachUpdate, Cause.Done>,
	predicate: (data: string) => boolean
) {
	return Effect.gen(function* () {
		let data = ''
		while (!predicate(data)) {
			const update = yield* Queue.take(queue)
			if (update.type === 'snapshot' || update.type === 'data') data += update.data
		}

		return data
	})
}

function takeSnapshot(terminal: TerminalService) {
	return Effect.gen(function* () {
		const updates = yield* terminal.attachQueue
		yield* Queue.take(updates)
		return yield* pipe(
			Queue.take(updates),
			Effect.map(update => (update.type === 'snapshot' ? update.data : ''))
		)
	})
}

function snapshotContaining(terminal: TerminalService, text: string) {
	return Effect.gen(function* () {
		let snapshot = ''
		while (!snapshot.includes(text)) {
			yield* Effect.sleep('25 millis')
			snapshot = yield* takeSnapshot(terminal)
		}

		return snapshot
	})
}

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

	it('delivers live attach data without dropping chunks under burst output', async () => {
		const output = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"process.stdout.write(`start${'x'.repeat(2_000_000)}end`)"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					const updates = yield* terminal.attachQueue
					yield* Queue.take(updates)
					yield* Queue.take(updates)
					const fiber = yield* Effect.forkScoped(collectDataUntil(updates, data => data.includes('end')))
					yield* terminal.restart()
					return yield* Fiber.join(fiber)
				})
			)
		)

		expect(output).toContain('start')
		expect(output).toContain('end')
		expect(output.length).toBeGreaterThan(2_000_000)
	})

	it('serializes Codex-like terminal state for replay snapshots', async () => {
		const snapshot = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make('sh', [
								'-lc',
								"printf '\\033[2J\\033[3;1H\\033[31mPlan\\033[0m\\033[4;1H\\033[?25l\\033[?25hfinal'"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					return yield* snapshotContaining(terminal, 'Plan')
				})
			)
		)

		expect(snapshot).toContain('Plan')
		expect(snapshot).toContain('final')
		expect(snapshot).not.toMatch(/\u001b\[[^A-Za-z]*$/u)
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
					return yield* snapshotContaining(terminal, 'terminal-ready')
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
