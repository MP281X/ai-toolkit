import {Array, pipe} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {terminalChunks, terminalOscUpdates, terminalTitleStatus} from './model.ts'

describe('@deslop/terminal model', () => {
	it('chunks terminal output without dropping or reordering data', () => {
		const data = `${'a'.repeat(5)}${'b'.repeat(5)}${'c'.repeat(5)}`
		const chunks = terminalChunks(data, 6)

		expect(chunks).toEqual(['aaaaab', 'bbbbcc', 'ccc'])
		expect(pipe(chunks, Array.join(''))).toBe(data)
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
