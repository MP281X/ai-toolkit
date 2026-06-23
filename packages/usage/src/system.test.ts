import {describe, expect, it} from 'vite-plus/test'

import {cpuUtilization, darwinMemoryUtilization} from './system.ts'

describe('cpuUtilization', () => {
	it('calculates busy CPU from cumulative idle and total deltas', () => {
		expect(cpuUtilization({after: {idle: 250, total: 500}, before: {idle: 100, total: 200}})).toBe(50)
	})

	it('returns zero when the CPU sample does not advance', () => {
		expect(cpuUtilization({after: {idle: 100, total: 200}, before: {idle: 100, total: 200}})).toBe(0)
	})
})

describe('darwinMemoryUtilization', () => {
	it('uses active, wired, and compressed pages as used memory', () => {
		expect(
			darwinMemoryUtilization({
				memsizeOutput: '160000\n',
				vmStatOutput: `Mach Virtual Memory Statistics: (page size of 1000 bytes)
Pages free:                               10.
Pages active:                             40.
Pages inactive:                           80.
Pages speculative:                        20.
Pages wired down:                         30.
Pages purgeable:                          10.
Pages occupied by compressor:             10.
`
			})
		).toBe(50)
	})

	it('ignores cache-like inactive and speculative pages', () => {
		expect(
			darwinMemoryUtilization({
				memsizeOutput: '100000\n',
				vmStatOutput: `Mach Virtual Memory Statistics: (page size of 1000 bytes)
Pages free:                                0.
Pages active:                             20.
Pages inactive:                           70.
Pages speculative:                        20.
Pages wired down:                         10.
Pages occupied by compressor:              0.
`
			})
		).toBe(30)
	})
})
