import {describe, expect, it} from 'vite-plus/test'

import {terminalAttachmentOperations, terminalAttachmentSizeEqual} from './-terminal-attachment-model.ts'

describe('terminalAttachmentSizeEqual', () => {
	it('rejects snapshots for stale terminal sizes', () => {
		expect(terminalAttachmentSizeEqual({cols: 120, rows: 32}, {cols: 120, rows: 32})).toBe(true)
		expect(terminalAttachmentSizeEqual({cols: 120, rows: 32}, {cols: 119, rows: 32})).toBe(false)
		expect(terminalAttachmentSizeEqual({cols: 120, rows: 32}, {cols: 120, rows: 31})).toBe(false)
	})
})

describe('terminalAttachmentOperations', () => {
	it('keeps reset/output ordering ordered and sequence-filtered', () => {
		expect(
			terminalAttachmentOperations({
				frames: [
					{data: 'stale', sequence: 1, type: 'output'},
					{data: 'b', sequence: 4, type: 'output'},
					{sequence: 2, type: 'reset'},
					{data: 'a', sequence: 3, type: 'output'},
					{sequence: 5, type: 'reset'},
					{data: 'c', sequence: 6, type: 'output'}
				],
				lastSequence: 1
			})
		).toEqual({
			lastSequence: 6,
			operations: [{type: 'reset'}, {data: 'ab', type: 'output'}, {type: 'reset'}, {data: 'c', type: 'output'}]
		})
	})
})
