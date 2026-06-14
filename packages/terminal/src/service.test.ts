import {chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {Array as Arr, ConfigProvider, Context, Effect, Fiber, Layer, Stream, SubscriptionRef, pipe} from 'effect'

import HeadlessModule from '@xterm/headless'
import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import {terminalChunks} from './model.ts'
import type {TerminalFrame, TerminalSize} from './schema.ts'
import {Terminal} from './service.ts'

type TerminalService = typeof Terminal.Service

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/tui-torture.ts')

function collectOutput(frames: readonly TerminalFrame[]) {
	return frames.flatMap(frame => (frame.type === 'output' ? [frame.data] : [])).join('')
}

function framesUntil(
	terminal: TerminalService,
	predicate: (frames: readonly TerminalFrame[]) => boolean,
	size?: TerminalSize
) {
	const seenFrames: TerminalFrame[] = []

	return pipe(
		terminal.attach(size),
		Stream.takeUntilEffect(frame =>
			Effect.sync(() => {
				seenFrames.push(frame)
				return predicate(seenFrames)
			})
		),
		Stream.runCollect
	)
}

function outputUntil(
	terminal: TerminalService,
	predicate: (state: {readonly tail: string; readonly total: number}) => boolean
) {
	const chunks: string[] = []
	let tail = ''
	let total = 0

	return pipe(
		terminal.attach(),
		Stream.takeUntilEffect(frame =>
			Effect.sync(() => {
				if (frame.type === 'output') {
					chunks.push(frame.data)
					total += frame.data.length
					tail = `${tail}${frame.data}`.slice(-128)
				}
				return predicate({tail, total})
			})
		),
		Stream.runDrain,
		Effect.map(() => ({chunks, total}))
	)
}

const defaultRenderSize: TerminalSize = {cols: 80, rows: 24}

async function renderFrames(frames: readonly TerminalFrame[], size: TerminalSize = defaultRenderSize) {
	const terminal = new HeadlessModule.Terminal({...size, allowProposedApi: true, scrollback: 20_000})
	for (const frame of frames) {
		if (frame.type === 'reset') {
			terminal.reset()
			continue
		}
		await new Promise<void>(resolve => {
			terminal.write(frame.data, resolve)
		})
	}
	const buffer = terminal.buffer.active
	const lines = pipe(
		Arr.range(0, buffer.length - 1),
		Arr.map(index => buffer.getLine(index)?.translateToString(true) ?? '')
	)
	const screen = {bufferType: buffer.type, cursorX: buffer.cursorX, cursorY: buffer.cursorY, text: lines.join('\n')}
	terminal.dispose()
	return screen
}

function midStreamEquivalence(delay: `${number} millis`) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const context = yield* Layer.buildWithScope(
					Terminal.layer({command: ChildProcess.make(process.execPath, [fixturePath]), cwd: process.cwd()}),
					yield* Effect.scope
				)
				const terminal = Context.get(context, Terminal)
				const first = yield* pipe(
					framesUntil(terminal, frames => collectOutput(frames).includes('phase:done'), {cols: 60, rows: 12}),
					Effect.forkScoped
				)
				yield* terminal.restart()
				yield* Effect.sleep(delay)
				const mid = yield* framesUntil(terminal, frames => collectOutput(frames).includes('phase:done'), {
					cols: 60,
					rows: 12
				})

				return {first: yield* Fiber.join(first), mid}
			})
		)
	)
}

describe('@deslop/terminal service', () => {
	it('supports black-box terminal mocks with command callbacks', async () => {
		const writes: string[] = []
		const resizes: string[] = []
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const terminal = yield* Terminal
				const replay = yield* pipe(terminal.attach({cols: 80, rows: 24}), Stream.runCollect)
				yield* terminal.write({data: 'input', type: 'text'})
				yield* terminal.resize({cols: 80, rows: 24})
				const stopped = yield* terminal.stop()

				return {output: collectOutput(replay), status: yield* SubscriptionRef.get(terminal.status), stopped}
			}).pipe(
				Effect.provide(
					Terminal.layerMock({
						frames: [
							{sequence: 0, type: 'reset'},
							{data: 'first', sequence: 1, type: 'output'},
							{data: 'second', sequence: 2, type: 'output'}
						],
						resize: size => Effect.sync(() => resizes.push(`${size.cols}x${size.rows}`)),
						write: input => Effect.sync(() => writes.push(input.type === 'text' ? input.data : 'bytes'))
					})
				)
			)
		)

		expect(result.output).toBe('firstsecond')
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

	it('starts the default shell from the first attach', async () => {
		const root = mkdtempSync(join(tmpdir(), 'deslop-terminal-'))
		const shell = join(root, 'shell')
		writeFileSync(shell, '#!/bin/sh\nprintf default-shell-ready\n', {mode: 0o755})
		chmodSync(shell, 0o755)

		try {
			const frames = await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const context = yield* Layer.buildWithScope(Terminal.layer({cwd: root}), yield* Effect.scope)
						const terminal = Context.get(context, Terminal)

						return yield* framesUntil(
							terminal,
							currentFrames => collectOutput(currentFrames).includes('default-shell-ready'),
							{cols: 80, rows: 24}
						)
					})
				).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({SHELL: shell}))))
			)

			expect(collectOutput(frames)).toContain('default-shell-ready')
		} finally {
			rmSync(root, {force: true, recursive: true})
		}
	})

	for (const delay of ['20 millis', '80 millis', '160 millis', '260 millis'] as const) {
		it(`makes a ${delay} snapshot client equivalent to a client attached from the start`, async () => {
			const result = await midStreamEquivalence(delay)

			await expect(renderFrames(result.mid, {cols: 60, rows: 12})).resolves.toEqual(
				await renderFrames(result.first, {cols: 60, rows: 12})
			)
		})
	}

	it('keeps numbered snapshot and live output contiguous without gaps or duplicates', async () => {
		const frames = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"let i=0; const tick=()=>{ if (i >= 80) return; process.stdout.write(`number-${String(i).padStart(3, '0')}\\r\\n`); i++; setTimeout(tick, 4) }; tick()"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					yield* Effect.sleep('120 millis')
					return yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes('number-079'))
				})
			)
		)
		const numbers = [...collectOutput(frames).matchAll(/number-(\d+)/g)].map(match => Number(match[1]))

		expect(numbers).toEqual(
			pipe(
				Arr.range(0, 79),
				Arr.map(index => index)
			)
		)
	})

	it('keeps sequences increasing across restart reset frames', async () => {
		const sequences = await Effect.runPromise(
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
					const second = yield* framesUntil(terminal, frames => collectOutput(frames).includes('ready'))

					return [...first, ...second].map(frame => frame.sequence)
				})
			)
		)

		expect(sequences).toEqual([...sequences].toSorted((left, right) => left - right))
		expect(new Set(sequences).size).toBe(sequences.length)
	})

	it('takes snapshots at the provided attach size', async () => {
		const frames = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({command: ChildProcess.make('sh', ['-lc', 'printf abcdef']), cwd: process.cwd()}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* pipe(terminal.attach({cols: 3, rows: 3}), Stream.take(1), Stream.runCollect)
					yield* terminal.restart()
					yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes('abcdef'))

					return yield* pipe(terminal.attach({cols: 3, rows: 3}), Stream.take(2), Stream.runCollect)
				})
			)
		)

		const screen = await renderFrames(frames, {cols: 3, rows: 3})

		expect(screen.text).toContain('abc\ndef')
	})

	it('keeps repaint-storm snapshots bounded by screen scrollback instead of raw byte history', async () => {
		const frames = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"for (let i=0; i<5000; i++) process.stdout.write(`\\x1b[2K\\x1b[1Grepaint-${i}`); process.stdout.write('\\r\\ndone')"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* terminal.restart()
					yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes('done'))

					return yield* pipe(terminal.attach({cols: 80, rows: 24}), Stream.take(2), Stream.runCollect)
				})
			)
		)

		expect(collectOutput(frames).length).toBeLessThan(10_000)
		expect(collectOutput(frames)).toContain('done')
	})

	it('preserves screen state for randomized chunk boundaries over escape-dense wide text', async () => {
		const data = [
			'chunk-fuzz:start\r\n',
			...pipe(
				Arr.range(0, 120),
				Arr.map(index => `\u001b[2K\u001b[1Grow-${index}-🙂-┌─┐\r\n`)
			),
			'\u001b[?1049halt-🙂\r\n\u001b[?1049l',
			'chunk-fuzz:end\r\n'
		].join('')
		const expected = await renderFrames([{data, sequence: 1, type: 'output'}])
		let seed = 17

		for (let round = 0; round < 25; round += 1) {
			seed = (seed * 1103515245 + 12345) % 2147483648
			const size = (seed % (64 * 1024)) + 1
			const frames = terminalChunks(data, size).map((chunk, index) => ({
				data: chunk,
				sequence: index + 1,
				type: 'output' as const
			}))

			expect(await renderFrames(frames)).toEqual(expected)
		}
	})

	it('delivers burst output to an active client when another client is dropped as slow', async () => {
		const output = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"let i=0; const tick=()=>{ if (i >= 1400) { process.stdout.write('end'); return } process.stdout.write(`chunk-${i}\\r\\n`); i++; setImmediate(tick) }; tick()"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* pipe(
						terminal.attach(),
						Stream.runForEach(() => Effect.never),
						Effect.forkScoped
					)
					yield* terminal.restart()
					yield* Effect.sleep('50 millis')

					return collectOutput(
						yield* framesUntil(terminal, currentFrames => collectOutput(currentFrames).includes('end'))
					)
				})
			)
		)

		expect(output).toContain('end')
	})

	it('delivers a 50MB burst with an attached client and a slow dropped client', async () => {
		const output = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const context = yield* Layer.buildWithScope(
						Terminal.layer({
							command: ChildProcess.make(process.execPath, [
								'-e',
								"process.stdout.write('start'); const chunk = 'x'.repeat(1024 * 1024); for (let i = 0; i < 50; i++) process.stdout.write(chunk); process.stdout.write('end')"
							]),
							cwd: process.cwd()
						}),
						yield* Effect.scope
					)
					const terminal = Context.get(context, Terminal)
					yield* pipe(
						terminal.attach(),
						Stream.runForEach(() => Effect.never),
						Effect.forkScoped
					)
					const active = yield* pipe(
						outputUntil(terminal, state => state.tail.includes('end')),
						Effect.forkScoped
					)
					yield* terminal.restart()

					return yield* Fiber.join(active)
				})
			)
		)
		const text = output.chunks.join('')

		expect(text.startsWith('start')).toBe(true)
		expect(text.endsWith('end')).toBe(true)
		expect(output.total).toBeGreaterThan(50 * 1024 * 1024)
	}, 60_000)
})
