import {NodeServices} from '@effect/platform-node'
import {describe, expect, it} from '@effect/vitest'

import type {Scope} from 'effect'
import {Array, Context, Effect, Fiber, Stream, String, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {Terminal} from './service.ts'

function runTerminal<A>(
	effect: Effect.Effect<A, unknown, Scope.Scope | Terminal>,
	command = ChildProcess.make(process.execPath, ['-e', "console.log('terminal-ready'); setInterval(() => {}, 1000)"])
) {
	return Effect.runPromiseWith(Context.empty())(
		pipe(
			effect,
			Effect.scoped,
			Effect.provide(Terminal.layer({command, cwd: process.cwd()})),
			Effect.provide(NodeServices.layer)
		)
	)
}

describe('Terminal', () => {
	it('streams output after restart and accepts resize updates', async () => {
		const frames = await runTerminal(
			Effect.gen(function* () {
				const terminal = yield* Terminal
				yield* terminal.resize({cols: 80, rows: 24})
				const status = yield* terminal.restart
				expect(status.state).toBe('running')

				const outputFrames = yield* pipe(
					terminal.attach({cols: 80, rows: 24}),
					Stream.takeUntil(frame => frame.type === 'output' && String.includes('terminal-ready')(frame.data)),
					Stream.runCollect,
					Effect.timeout('5 seconds')
				)
				yield* terminal.stop
				return outputFrames
			})
		)

		expect(Array.some(frames, frame => frame.type === 'output' && String.includes('terminal-ready')(frame.data))).toBe(
			true
		)
	})

	it('keeps an active attachment alive during burst output', async () => {
		const frames = await runTerminal(
			Effect.gen(function* () {
				const terminal = yield* Terminal
				const fiber = yield* Effect.forkScoped(
					pipe(
						terminal.attach({cols: 80, rows: 24}),
						Stream.takeUntil(frame => frame.type === 'output' && String.includes('burst-ready')(frame.data)),
						Stream.runCollect,
						Effect.timeout('5 seconds')
					)
				)
				const status = yield* terminal.restart
				expect(status.state).toBe('running')
				const outputFrames = yield* Fiber.join(fiber)
				yield* terminal.stop
				return outputFrames
			}),
			ChildProcess.make(process.execPath, [
				'-e',
				"process.stdout.write('x'.repeat(512 * 1024)); console.log('burst-ready'); setInterval(() => {}, 1000)"
			])
		)

		expect(Array.some(frames, frame => frame.type === 'output' && String.includes('burst-ready')(frame.data))).toBe(
			true
		)
	})
})
