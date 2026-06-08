import {Array, pipe} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {
	terminalByteLength,
	terminalChunks,
	terminalOscUpdates,
	terminalReplayPush,
	terminalTitleStatus
} from './model.ts'

function replayBytes(chunks: readonly string[]) {
	return chunks.reduce((total, chunk) => total + terminalByteLength(chunk), 0)
}

describe('@deslop/terminal model', () => {
	it('chunks terminal output without dropping or reordering data', () => {
		const data = `${'a'.repeat(5)}${'b'.repeat(5)}${'c'.repeat(5)}`
		const chunks = terminalChunks(data, 6)

		expect(chunks).toEqual(['aaaaab', 'bbbbcc', 'ccc'])
		expect(pipe(chunks, Array.join(''))).toBe(data)
	})

	it('keeps replay bounded while preserving the newest bytes', () => {
		const empty: readonly string[] = []
		const replay = pipe(
			['first-', 'second-', 'third-', 'fourth'],
			Array.reduce(empty, (ring, chunk) => terminalReplayPush(ring, chunk, 18))
		)

		expect(replayBytes(replay)).toBeLessThanOrEqual(18)
		expect(pipe(replay, Array.join(''))).toBe('econd-third-fourth')
	})

	it('keeps replay memory flat under sustained output', () => {
		const empty: readonly string[] = []
		const started = performance.now()
		const replay = pipe(
			Array.range(0, 10_000),
			Array.reduce(empty, (ring, index) => terminalReplayPush(ring, `${index.toString().padStart(5, '0')}\n`, 4096))
		)

		expect(replayBytes(replay)).toBeLessThanOrEqual(4096)
		expect(pipe(replay, Array.join(''))).toContain('09999')
		expect(replay.length).toBeLessThan(700)
		expect(performance.now() - started).toBeLessThan(1_000)
	})

	it('parses exact OSC title and progress signals', () => {
		expect(terminalOscUpdates('\u001b]2;build ready\u0007').updates).toEqual([{title: 'build ready', type: 'title'}])
		expect(terminalOscUpdates('\u001b]0;Action\u001b\\').updates).toEqual([{title: 'Action', type: 'title'}])
		expect(terminalOscUpdates('\u001b]9;4;4\u0007').updates).toEqual([{state: 'waiting', type: 'progress'}])
		expect(terminalOscUpdates('\u001b]9;4;0\u0007').updates).toEqual([{state: 'idle', type: 'progress'}])
		expect(terminalOscUpdates('\u001b]1;ignored\u0007').updates).toEqual([])
		expect(terminalOscUpdates('2;build ready\u0007', terminalOscUpdates('\u001b]').carry).updates).toEqual([
			{title: 'build ready', type: 'title'}
		])
		expect(terminalOscUpdates('\\', terminalOscUpdates('\u001b]9;4;4\u001b').carry).updates).toEqual([
			{state: 'waiting', type: 'progress'}
		])
	})

	it('maps title text to terminal status without legacy title parsing', () => {
		expect(terminalTitleStatus('  [!] Action Required approve  ')).toEqual({
			state: 'waiting',
			title: 'Action Required approve'
		})
		expect(terminalTitleStatus('Working | compiling')).toEqual({state: 'running', title: 'Working | compiling'})
		expect(terminalTitleStatus('')).toEqual({state: 'idle', title: ''})
	})
})
