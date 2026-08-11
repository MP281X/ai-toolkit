import {Array, Effect, Match, Number, Option, Predicate, String, pipe} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import HeadlessModule from '@xterm/headless'

import type {TerminalSize, TerminalStatus} from './schema.ts'

export function terminalChunks(data: string, chunkSize = 65536) {
	if (data === '') return Array.empty<string>()

	function nextEnd(start: number) {
		const candidate = Math.min(start + chunkSize, data.length)
		if (candidate >= data.length) return candidate
		const previous = pipe(
			data,
			String.charCodeAt(candidate - 1),
			Option.getOrElse(() => -1)
		)
		const next = pipe(
			data,
			String.charCodeAt(candidate),
			Option.getOrElse(() => -1)
		)
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
			if (data === '') return Effect.void

			return Effect.callback(resume => {
				screen.write(data, () => {
					resume(Effect.void)
				})
			})
		}
	}
}

const terminalTitleDecorationPattern = /^[\s\-–—_·•*✢✣✤✥✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿πΠ∏]+/u
const terminalTitleActivityPattern = /^[\s·•*✢✣✤✥✦✧✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿\u2800-\u28ff]/u

function terminalTitleContent(title: string) {
	return pipe(title, String.replace(terminalTitleDecorationPattern, ''), String.trim)
}

function terminalTitleActivity(title: string) {
	if (/^Claude Code$/iu.test(terminalTitleContent(title))) return false
	return terminalTitleActivityPattern.test(title)
}

function normalizeTerminalTitle(title: string) {
	const normalized = pipe(
		Array.fromIterable(title),
		Array.filter(char => {
			const codePoint = pipe(
				char,
				String.codePointAt(0),
				Option.getOrElse(() => 0)
			)
			if (codePoint <= 0x1f || codePoint === 0x7f || (codePoint >= 0x80 && codePoint <= 0x9f)) return false
			if (codePoint === 0xfffd) return false
			if (codePoint >= 0x2800 && codePoint <= 0x28ff) return false
			return true
		}),
		Array.join(''),
		String.trim
	)
	if (normalized === '') return

	const chars = Array.fromIterable(normalized)
	return Array.length(chars) <= 200 ? normalized : pipe(chars, Array.take(200), Array.join(''))
}

export function terminalTitleStatus(title: string) {
	const trimmed = String.trim(title)
	if (trimmed === '') return {state: 'idle' as const, title: ''}

	if (/^\[\s*[!.]\s*\]\s*Action Required\b/iu.test(trimmed)) {
		return {state: 'waiting' as const, title: String.replace(/^\[\s*[!.]\s*\]\s*/iu, '')(trimmed) || trimmed}
	}

	return {state: 'idle' as const, title: trimmed}
}

function terminalProgressStatus(value: string) {
	const progressState = pipe(
		value,
		Number.parse,
		Option.getOrElse(() => -1)
	)
	return pipe(
		Match.value(progressState),
		Match.when(0, () => 'idle' as const),
		Match.when(2, () => 'failed' as const),
		Match.when(4, () => 'waiting' as const),
		Match.orElse(() => 'running' as const)
	)
}

function terminalOscStart(input: string, index: number) {
	const code = pipe(
		input,
		String.charCodeAt(index),
		Option.getOrElse(() => -1)
	)
	if (code === 0x9d) return {length: 1, payloadStart: index + 1}
	if (code === 0x1b && input[index + 1] === ']') return {length: 2, payloadStart: index + 2}
	return void 0
}

function terminalOscEnd(input: string, payloadStart: number) {
	const bell = pipe(
		String.slice(payloadStart)(input),
		String.indexOf('\u0007'),
		Option.map(index => index + payloadStart),
		Option.getOrElse(() => -1)
	)
	const st = pipe(
		String.slice(payloadStart)(input),
		String.indexOf('\u001b\\'),
		Option.map(index => index + payloadStart),
		Option.getOrElse(() => -1)
	)
	const c1St = pipe(
		String.slice(payloadStart)(input),
		String.indexOf('\u009c'),
		Option.map(index => index + payloadStart),
		Option.getOrElse(() => -1)
	)
	const candidates = Array.filter([bell, st, c1St], index => index !== -1)
	const end = Array.reduce(candidates, -1, (current, candidate) =>
		current === -1 || candidate < current ? candidate : current
	)
	if (end === -1) return
	return {index: end, length: end === st ? 2 : 1}
}

function terminalOscTitleUpdate(command: string, value: string) {
	if (command === '0' || command === '2') {
		const title = normalizeTerminalTitle(value)
		if (Predicate.isUndefined(title) && !terminalTitleActivity(value)) return
		return {state: terminalTitleActivity(value) ? ('running' as const) : undefined, title, type: 'title'} as const
	}
	if (command !== '9') return
	if (value === '3;') return {state: 'idle' as const, title: undefined, type: 'title'} as const
	if (!String.startsWith('3;')(value)) return

	const rawTitle = String.slice(2)(value)
	const title = normalizeTerminalTitle(rawTitle)
	if (Predicate.isUndefined(title) && !terminalTitleActivity(rawTitle)) return
	return {state: terminalTitleActivity(rawTitle) ? ('running' as const) : undefined, title, type: 'title'} as const
}

export function terminalOscUpdates(data: string, carry = '') {
	const input = `${carry}${data}`
	const scan = {
		index: 0,
		nextCarry: '',
		updates: Array.empty<
			| {state?: TerminalStatus['state']; title?: string; type: 'title'}
			| {state: TerminalStatus['state']; type: 'progress'}
		>()
	}

	while (scan.index < input.length) {
		const start = terminalOscStart(input, scan.index)
		if (Predicate.isUndefined(start)) {
			if (pipe(input, String.charCodeAt(scan.index), Option.contains(0x1b)) && scan.index === input.length - 1) {
				scan.nextCarry = String.slice(scan.index)(input)
				break
			}
			scan.index += 1
		} else {
			const end = terminalOscEnd(input, start.payloadStart)
			if (Predicate.isUndefined(end)) {
				scan.nextCarry = String.slice(scan.index)(input)
				break
			}

			const payload = String.slice(start.payloadStart, end.index)(input)
			const separator = pipe(
				payload,
				String.indexOf(';'),
				Option.getOrElse(() => -1)
			)
			const command = separator === -1 ? payload : String.slice(0, separator)(payload)
			const value = separator === -1 ? '' : String.slice(separator + 1)(payload)
			const titleUpdate = terminalOscTitleUpdate(command, value)
			if (Predicate.isNotUndefined(titleUpdate)) scan.updates = Array.append(scan.updates, titleUpdate)
			if (command === '9' && String.startsWith('4;')(value)) {
				scan.updates = Array.append(scan.updates, {
					state: terminalProgressStatus(String.slice(2)(value)),
					type: 'progress'
				})
			}
			scan.index = end.index + end.length
		}
	}

	return {carry: Buffer.byteLength(scan.nextCarry) > 4096 ? '' : scan.nextCarry, updates: scan.updates}
}
