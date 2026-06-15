import {Array, Option, String, pipe} from 'effect'

import type {TerminalStatus} from './schema.ts'

export const terminalHistoryMaxBytes = 8 * 1024 * 1024
export const terminalHistoryMaxChunks = 4_096
export const terminalHistoryMaxLines = 10_000

export type TerminalHistory = {
	readonly bytes: number
	readonly chunks: readonly {readonly data: string; readonly sequence: number}[]
	readonly lines: number
}

export function emptyTerminalHistory(): TerminalHistory {
	return {bytes: 0, chunks: [], lines: 0}
}

function lineCount(data: string) {
	return Array.length(String.split('\n')(data)) - 1
}

export function trimTerminalHistory(input: TerminalHistory): TerminalHistory {
	const state = {bytes: input.bytes, lines: input.lines, start: 0}

	while (
		(state.bytes > terminalHistoryMaxBytes ||
			state.lines > terminalHistoryMaxLines ||
			input.chunks.length - state.start > terminalHistoryMaxChunks) &&
		state.start < input.chunks.length
	) {
		if (input.chunks[state.start] === undefined) break

		state.bytes -= Buffer.byteLength(input.chunks[state.start]!.data)
		state.lines -= lineCount(input.chunks[state.start]!.data)
		state.start += 1
	}

	return {bytes: state.bytes, chunks: Array.drop(input.chunks, state.start), lines: state.lines}
}

export function appendTerminalHistory(input: TerminalHistory, data: string, sequence: number): TerminalHistory {
	if (data === '') return input

	const chunks = pipe(
		Array.last(input.chunks),
		Option.filter(last => Buffer.byteLength(last.data) + Buffer.byteLength(data) <= 16 * 1024),
		Option.match({
			onNone: () => Array.append(input.chunks, {data, sequence}),
			onSome: last => Array.append(Array.dropRight(input.chunks, 1), {data: `${last.data}${data}`, sequence})
		})
	)

	return trimTerminalHistory({
		bytes: input.bytes + Buffer.byteLength(data),
		chunks,
		lines: input.lines + lineCount(data)
	})
}

export function terminalChunks(data: string, chunkSize = 16 * 1024) {
	if (data === '') return Array.empty<string>()

	return Array.unfold(0, start => {
		if (start >= data.length) return Option.none()

		const candidateEnd = Math.min(start + chunkSize, data.length)
		const safeEnd =
			candidateEnd < data.length &&
			/[\uD800-\uDBFF]/u.test(String.slice(candidateEnd - 1, candidateEnd)(data)) &&
			/[\uDC00-\uDFFF]/u.test(String.slice(candidateEnd, candidateEnd + 1)(data))
				? candidateEnd - 1
				: candidateEnd
		const end = safeEnd === start ? candidateEnd : safeEnd
		return Option.some([String.slice(start, end)(data), end] as const)
	})
}

export function terminalTitleStatus(title: string): TerminalStatus {
	const trimmed = String.trim(title)
	if (trimmed === '') return {state: 'idle', title: ''}

	if (/^\[\s*[!.]\s*\]\s*Action Required\b/iu.test(trimmed)) {
		return {state: 'waiting', title: String.replace(/^\[\s*[!.]\s*\]\s*/iu, '')(trimmed) || trimmed}
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
	const emptyUpdates = Array.empty<
		| {readonly title: string; readonly type: 'title'}
		| {readonly state: TerminalStatus['state']; readonly type: 'progress'}
	>()

	function appendOscUpdate(payload: string, updates = emptyUpdates) {
		const separator = payload.indexOf(';')
		const command = separator === -1 ? payload : String.slice(0, separator)(payload)
		const value = separator === -1 ? '' : String.slice(separator + 1)(payload)
		if (command === '0' || command === '2') return Array.append(updates, {title: value, type: 'title' as const})
		if (command === '9' && String.startsWith('4;')(value)) {
			return Array.append(updates, {state: terminalProgressStatus(String.slice(2)(value)), type: 'progress' as const})
		}
		return updates
	}

	const state = {carry: '', index: 0, updates: emptyUpdates}

	while (state.index < input.length) {
		if (input.codePointAt(state.index) !== 27) {
			state.index += 1
			continue
		}
		if (state.index === input.length - 1) {
			state.carry = String.slice(state.index)(input)
			break
		}
		if (input[state.index + 1] !== ']') {
			state.index += 1
			continue
		}

		const start = state.index + 2
		const bel = input.indexOf('\u0007', start)
		const st = input.indexOf('\u001B\\', start)
		const terminator = bel === -1 || (st !== -1 && st < bel) ? {end: st, skip: 2} : {end: bel, skip: 1}
		if (terminator.end === -1) {
			state.carry = String.slice(state.index)(input)
			break
		}

		state.updates = appendOscUpdate(String.slice(start, terminator.end)(input), state.updates)
		state.index = terminator.end + terminator.skip
	}

	return {carry: Buffer.byteLength(state.carry) > 4 * 1024 ? '' : state.carry, updates: state.updates}
}
