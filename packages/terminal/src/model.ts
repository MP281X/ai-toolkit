import {Array, Match, Option, String, pipe} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import HeadlessModule from '@xterm/headless'

import type {TerminalSize, TerminalStatus} from './schema.ts'

export function terminalChunks(data: string, chunkSize = 65536) {
	if (data === '') return Array.empty<string>()

	function nextEnd(start: number) {
		const candidate = Math.min(start + chunkSize, data.length)
		if (candidate >= data.length) return candidate
		const previous = data.charCodeAt(candidate - 1)
		const next = data.charCodeAt(candidate)
		const safeEnd =
			previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? candidate - 1 : candidate
		return safeEnd === start ? Math.min(start + chunkSize, data.length) : safeEnd
	}

	function collect(start: number, chunks = Array.empty<string>()) {
		if (start >= data.length) return chunks
		const end = nextEnd(start)
		return collect(end, Array.append(chunks, String.slice(start, end)(data)))
	}

	return collect(0)
}

export function terminalScreenStore(size?: TerminalSize) {
	const screen = new HeadlessModule.Terminal({
		allowProposedApi: true,
		cols: size?.cols ?? 120,
		rows: size?.rows ?? 32,
		scrollback: 1_000
	})
	const serialize = new SerializeAddon()
	screen.loadAddon({
		activate: terminal => {
			// @ts-expect-error SerializeAddon supports headless terminals at runtime, but its type targets the DOM terminal.
			serialize.activate(terminal)
		},
		dispose: () => {
			serialize.dispose()
		}
	})

	return {
		dispose() {
			screen.dispose()
		},
		reset() {
			screen.reset()
		},
		resize(nextSize: TerminalSize) {
			if (screen.cols === nextSize.cols && screen.rows === nextSize.rows) return
			screen.resize(nextSize.cols, nextSize.rows)
		},
		snapshot() {
			return terminalChunks(serialize.serialize({scrollback: 1_000}))
		},
		write(data: string) {
			if (data === '') return Promise.resolve()

			return new Promise<void>(resolve => {
				screen.write(data, () => {
					resolve()
				})
			})
		}
	}
}

export function terminalTitleStatus(title: string) {
	const trimmed = title.trim()
	if (trimmed === '') return {state: 'idle' as const, title: ''}

	if (/^\[\s*[!.]\s*\]\s*Action Required\b/iu.test(trimmed)) {
		return {state: 'waiting' as const, title: trimmed.replace(/^\[\s*[!.]\s*\]\s*/iu, '') || trimmed}
	}

	return {state: 'running' as const, title: trimmed}
}

function terminalProgressStatus(value: string) {
	const progressState = Number.parseInt(value, 10)
	return Match.value(progressState).pipe(
		Match.when(0, () => 'idle' as const),
		Match.when(2, () => 'failed' as const),
		Match.when(4, () => 'waiting' as const),
		Match.orElse(() => 'running' as const)
	)
}

export function terminalOscUpdates(data: string, carry = '') {
	const input = `${carry}${data}`
	const scan = {
		index: 0,
		nextCarry: '',
		updates: Array.empty<
			| {readonly title: string; readonly type: 'title'}
			| {readonly state: TerminalStatus['state']; readonly type: 'progress'}
		>()
	}

	while (scan.index < input.length) {
		if (input.charCodeAt(scan.index) !== 0x1b) {
			scan.index += 1
			continue
		}
		if (scan.index === input.length - 1) {
			scan.nextCarry = String.slice(scan.index)(input)
			break
		}
		if (input[scan.index + 1] !== ']') {
			scan.index += 1
			continue
		}

		const bell = pipe(
			String.slice(scan.index + 2)(input),
			String.indexOf('\u0007'),
			Option.map(index => index + scan.index + 2),
			Option.getOrElse(() => -1)
		)
		const st = pipe(
			String.slice(scan.index + 2)(input),
			String.indexOf('\u001b\\'),
			Option.map(index => index + scan.index + 2),
			Option.getOrElse(() => -1)
		)
		const end = bell === -1 || (st !== -1 && st < bell) ? st : bell
		const skip = bell === -1 || (st !== -1 && st < bell) ? 2 : 1
		if (end === -1) {
			scan.nextCarry = String.slice(scan.index)(input)
			break
		}

		const payload = String.slice(scan.index + 2, end)(input)
		const separator = pipe(
			payload,
			String.indexOf(';'),
			Option.getOrElse(() => -1)
		)
		const command = separator === -1 ? payload : String.slice(0, separator)(payload)
		const value = separator === -1 ? '' : String.slice(separator + 1)(payload)
		if (command === '0' || command === '2') scan.updates = Array.append(scan.updates, {title: value, type: 'title'})
		if (command === '9' && String.startsWith('4;')(value)) {
			scan.updates = Array.append(scan.updates, {
				state: terminalProgressStatus(String.slice(2)(value)),
				type: 'progress'
			})
		}
		scan.index = end + skip
	}

	return {carry: Buffer.byteLength(scan.nextCarry) > 4096 ? '' : scan.nextCarry, updates: scan.updates}
}
