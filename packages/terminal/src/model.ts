import {Array, Option, String} from 'effect'

import type {TerminalStatus} from './schema.ts'

export function terminalChunks(data: string, chunkSize = 64 * 1024) {
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
