import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {Context, Effect, Fiber, Layer, Stream, SubscriptionRef, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import type {TerminalFrame} from './schema.ts'
import {Terminal} from './service.ts'

type TerminalService = typeof Terminal.Service

function collectOutput(frames: readonly TerminalFrame[]) {
	return frames.flatMap(frame => (frame.type === 'output' ? [frame.data] : [])).join('')
}

function framesUntil(terminal: TerminalService, predicate: (frames: readonly TerminalFrame[]) => boolean) {
	const seenFrames: TerminalFrame[] = []

	return pipe(
		terminal.attach(),
		Stream.takeUntilEffect(frame =>
			Effect.sync(() => {
				seenFrames.push(frame)
				return predicate(seenFrames)
			})
		),
		Stream.runCollect
	)
}

describe('@deslop/terminal service', () => {
	it('supports black-box terminal mocks with cursor replay and command callbacks', async () => {
		const writes: string[] = []
		const resizes: string[] = []
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const terminal = yield* Terminal
				const replay = yield* pipe(terminal.attach({epoch: 1, sequence: 1}), Stream.runCollect)
				yield* terminal.write({data: 'input', type: 'text'})
				yield* terminal.resize({cols: 80, rows: 24})
				const stopped = yield* terminal.stop()

				return {output: collectOutput(replay), status: yield* SubscriptionRef.get(terminal.status), stopped}
			}).pipe(
				Effect.provide(
					Terminal.layerMock({
						frames: [
							{cursor: {epoch: 1, sequence: 0}, type: 'reset'},
							{cursor: {epoch: 1, sequence: 1}, data: 'first', type: 'output'},
							{cursor: {epoch: 1, sequence: 2}, data: 'second', type: 'output'}
						],
						resize: size => Effect.sync(() => resizes.push(`${size.cols}x${size.rows}`)),
						write: input => Effect.sync(() => writes.push(input.type === 'text' ? input.data : 'bytes'))
					})
				)
			)
		)

		expect(result.output).toBe('second')
		expect(writes).toEqual(['input'])
		expect(resizes).toEqual(['80x24'])
		expect(result.stopped).toEqual({state: 'stopped', title: ''})
		expect(result.status).toEqual({state: 'stopped', title: ''})
	})

	it('accepts binary terminal input through the public schema', async () => {
		const writes: string[] = []
		await Effect.runPromise(
			Effect.gen(function* () {
				const terminal = yield* Terminal
				yield* terminal.write({data: new TextEncoder().encode('mouse'), type: 'bytes'})
			}).pipe(
				Effect.provide(
					Terminal.layerMock({
						write: input =>
							Effect.sync(() => {
								writes.push(input.type === 'bytes' ? new TextDecoder().decode(input.data) : input.data)
							})
					})
				)
			)
		)

		expect(writes).toEqual(['mouse'])
	})

	it('spawns prepared commands from their command cwd', async () => {
		const root = mkdtempSync(join(tmpdir(), 'deslop-terminal-'))
		const commandCwd = join(root, 'app')
		mkdirSync(commandCwd)

		try {
			const frames = await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const context = yield* Layer.buildWithScope(
							Terminal.layer({command: ChildProcess.make('sh', ['-lc', 'pwd'], {cwd: commandCwd}), cwd: root}),
							yield* Effect.scope
						)
						const terminal = Context.get(context, Terminal)
						yield* terminal.restart()

						return yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes(commandCwd))
					})
				)
			)

			expect(collectOutput(frames)).toContain(commandCwd)
		} finally {
			rmSync(root, {force: true, recursive: true})
		}
	})

	it('preserves a burst of PTY output through raw transcript replay', async () => {
		const transcript = await Effect.runPromise(
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

					return yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes('end'))
				})
			)
		)
		const output = collectOutput(transcript)

		expect(transcript[0]?.type).toBe('reset')
		expect(output).toContain('start')
		expect(output).toContain('end')
		expect(output.length).toBeGreaterThan(5_000)
	})

	it('restores at least 20,000 recent terminal lines when a cursor is too old', async () => {
		const frames = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"process.stdout.write(Array.from({length: 20100}, (_, index) => `line-${index.toString().padStart(5, '0')}\\n`).join(''))"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					const liveFrames = yield* framesUntil(terminal, currentFrames =>
						collectOutput(currentFrames).includes('line-20099')
					)
					const expiredCursor = liveFrames[0]?.cursor
					expect(expiredCursor).toBeDefined()

					return yield* pipe(
						terminal.attach(expiredCursor),
						Stream.takeUntil(frame => frame.type === 'output' && frame.data.includes('line-20099')),
						Stream.runCollect
					)
				})
			)
		)
		const output = collectOutput(frames)

		expect(output).toContain('line-00100')
		expect(output).toContain('line-20099')
		expect(output.split('\n').filter(line => line !== '').length).toBeGreaterThanOrEqual(20_000)
	}, 10_000)

	it('resumes replay after the acknowledged cursor', async () => {
		const replay = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make('sh', ['-lc', 'printf first; sleep 0.1; printf second']),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					const firstFrames = yield* framesUntil(terminal, frames => collectOutput(frames).includes('first'))
					const cursor = firstFrames[firstFrames.length - 1]?.cursor
					expect(cursor).toBeDefined()

					return yield* pipe(
						terminal.attach(cursor),
						Stream.takeUntil(frame => frame.type === 'output' && frame.data.includes('second')),
						Stream.runCollect
					)
				})
			)
		)
		const output = collectOutput(replay)

		expect(output).not.toContain('first')
		expect(output).toContain('second')
	})

	it('advances the transcript epoch on restart', async () => {
		const epochs = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({command: ChildProcess.make('sh', ['-lc', 'printf ready']), cwd: process.cwd()}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					const first = yield* framesUntil(terminal, frames => collectOutput(frames).includes('ready'))
					yield* terminal.restart()
					const second = yield* framesUntil(terminal, frames => {
						const reset = frames.find(frame => frame.type === 'reset')

						return reset !== undefined && reset.cursor.epoch > (first[0]?.cursor.epoch ?? 0)
					})

					return [first[0]?.cursor.epoch, second[0]?.cursor.epoch]
				})
			)
		)

		expect(epochs[1]).toBeGreaterThan(epochs[0] ?? -1)
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
					const fiber = yield* pipe(
						terminal.attach(),
						Stream.takeUntil(frame => frame.type === 'output' && frame.data.includes('end')),
						Stream.runCollect,
						Effect.forkScoped
					)
					yield* terminal.restart()

					return collectOutput(yield* Fiber.join(fiber))
				})
			)
		)

		expect(output).toContain('start')
		expect(output).toContain('end')
		expect(output.length).toBeGreaterThan(2_000_000)
	})
})
