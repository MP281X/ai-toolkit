import {describe, expect, it} from '@effect/vitest'

import {Array} from 'effect'

import {terminalAttachmentOperations} from './-terminal-attachment-model.ts'

describe('terminalAttachmentOperations', () => {
	it('filters stale frames and preserves sequence order', () => {
		const result = terminalAttachmentOperations({
			frames: [
				{data: 'c', sequence: 3, type: 'output'},
				{data: 'a', sequence: 1, type: 'output'},
				{data: 'b', sequence: 2, type: 'output'}
			],
			lastSequence: 1
		})

		expect(result).toEqual({lastSequence: 3, operations: [{data: 'bc', type: 'output'}]})
	})

	it('preserves reset boundaries while coalescing output', () => {
		const result = terminalAttachmentOperations({
			frames: [
				{data: 'before', sequence: 1, type: 'output'},
				{sequence: 2, type: 'reset'},
				{data: 'after', sequence: 3, type: 'output'}
			],
			lastSequence: -1
		})

		expect(result).toEqual({
			lastSequence: 3,
			operations: [{data: 'before', type: 'output'}, {type: 'reset'}, {data: 'after', type: 'output'}]
		})
	})

	it('caps coalesced output writes', () => {
		const result = terminalAttachmentOperations({
			frames: [
				{data: 'aaaa', sequence: 1, type: 'output'},
				{data: 'bbbb', sequence: 2, type: 'output'},
				{data: 'cccc', sequence: 3, type: 'output'}
			],
			lastSequence: -1,
			maxOutputLength: 5
		})

		expect(result.lastSequence).toBe(3)
		expect(result.operations).toEqual([
			{data: 'aaaab', type: 'output'},
			{data: 'bbbcc', type: 'output'},
			{data: 'cc', type: 'output'}
		])
		expect(Array.every(result.operations, operation => operation.type === 'reset' || operation.data.length <= 5)).toBe(
			true
		)
	})

	it('uses the production output cap by default', () => {
		const data = 'x'.repeat(65_537)
		const result = terminalAttachmentOperations({frames: [{data, sequence: 1, type: 'output'}], lastSequence: -1})

		expect(result.operations).toEqual([
			{data: 'x'.repeat(65_536), type: 'output'},
			{data: 'x', type: 'output'}
		])
	})
})
