import {Array, pipe} from 'effect'

import type {TerminalStatus} from './schema.ts'

export const terminalReplayBytes = 8 * 1024 * 1024
export const terminalChunkBytes = 64 * 1024
export const terminalReset = '\u001bc'

const terminalOscCarryBytes = 4096

export function terminalByteLength(data: string) {
	return Buffer.byteLength(data)
}

export function terminalChunks(data: string, chunkSize = terminalChunkBytes) {
	if (data === '') return Array.empty<string>()

	return pipe(
		Array.range(0, Math.floor((data.length - 1) / chunkSize)),
		Array.map(index => data.slice(index * chunkSize, (index + 1) * chunkSize))
	)
}

export function terminalReplayPush(ring: readonly string[], data: string, maxBytes = terminalReplayBytes) {
	let chunks = [...ring, data]
	let bytes = chunks.reduce((total, chunk) => total + terminalByteLength(chunk), 0)
	while (bytes > maxBytes) {
		const head = chunks[0]
		if (head === undefined) break

		const excess = bytes - maxBytes
		const headBytes = terminalByteLength(head)
		if (headBytes <= excess) {
			chunks = chunks.slice(1)
			bytes -= headBytes
			continue
		}

		let offset = Math.min(head.length, excess)
		while (offset < head.length && terminalByteLength(head.slice(offset)) > maxBytes - (bytes - headBytes)) {
			offset += 1
		}
		chunks[0] = head.slice(offset)
		bytes = chunks.reduce((total, chunk) => total + terminalByteLength(chunk), 0)
	}

	return chunks
}

export function terminalTitleStatus(title: string): TerminalStatus {
	const trimmed = title.trim()
	if (trimmed === '') return {state: 'idle', title: ''}

	if (/^\[\s*[!.]\s*\]\s*Action Required\b/iu.test(trimmed)) {
		return {state: 'waiting', title: trimmed.replace(/^\[\s*[!.]\s*\]\s*/iu, '') || trimmed}
	}

	return {state: 'running', title: trimmed}
}

export function terminalProgressStatus(value: string): TerminalStatus['state'] {
	const progressState = Number.parseInt(value, 10)
	if (progressState === 0) return 'idle'
	if (progressState === 2) return 'failed'
	if (progressState === 4) return 'waiting'
	return 'running'
}

export function terminalOscUpdates(data: string, carry = '') {
	const input = `${carry}${data}`
	const updates: (
		| {readonly title: string; readonly type: 'title'}
		| {readonly state: TerminalStatus['state']; readonly type: 'progress'}
	)[] = []
	let nextCarry = ''

	for (let index = 0; index < input.length; index += 1) {
		if (input.charCodeAt(index) !== 0x1b) continue
		if (index === input.length - 1) {
			nextCarry = input.slice(index)
			break
		}
		if (input[index + 1] !== ']') continue

		const start = index + 2
		let end = input.indexOf('\u0007', start)
		let skip = 1
		const st = input.indexOf('\u001b\\', start)
		if (end === -1 || (st !== -1 && st < end)) {
			end = st
			skip = 2
		}
		if (end === -1) {
			nextCarry = input.slice(index)
			break
		}

		const payload = input.slice(start, end)
		const separator = payload.indexOf(';')
		const command = separator === -1 ? payload : payload.slice(0, separator)
		const value = separator === -1 ? '' : payload.slice(separator + 1)
		if (command === '0' || command === '2') updates.push({title: value, type: 'title'})
		if (command === '9' && value.startsWith('4;')) {
			updates.push({state: terminalProgressStatus(value.slice(2)), type: 'progress'})
		}
		index = end + skip - 1
	}

	return {carry: terminalByteLength(nextCarry) > terminalOscCarryBytes ? '' : nextCarry, updates}
}
