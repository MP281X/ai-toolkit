import {Array, Match, Option, Predicate, String, pipe} from 'effect'

import {SerializeAddon} from '@xterm/addon-serialize'
import HeadlessModule from '@xterm/headless'

import type {TerminalSize, TerminalStatus} from './schema.ts'
export function terminalChunks(input: {readonly chunkSize?: number; readonly data: string}) {
	if (input.data === '') return Array.empty<string>()
	function nextEnd(start: number) {
		const candidate = Math.min(start + (input.chunkSize ?? 65536), input.data.length)
		if (candidate >= input.data.length) return candidate
		const previous = input.data.charCodeAt(candidate - 1)
		const next = input.data.charCodeAt(candidate)
		const safeEnd =
			previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? candidate - 1 : candidate
		return safeEnd === start ? Math.min(start + (input.chunkSize ?? 65536), input.data.length) : safeEnd
	}
	function collect(parameters: {readonly start: number; readonly chunks?: readonly string[]}) {
		if (parameters.start >= input.data.length) {
			return parameters.chunks ?? Array.empty<string>()
		}
		const end = nextEnd(parameters.start)
		return collect({
			chunks: Array.append(parameters.chunks ?? Array.empty<string>(), String.slice(parameters.start, end)(input.data)),
			start: end
		})
	}
	return collect({start: 0})
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
			return terminalChunks({data: serialize.serialize({scrollback: 1_000})})
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
			const codePoint = char.codePointAt(0) ?? 0
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
	const trimmed = title.trim()
	if (trimmed === '') return {state: 'idle' as const, title: ''}
	if (/^\[\s*[!.]\s*\]\s*Action Required\b/iu.test(trimmed)) {
		return {state: 'waiting' as const, title: String.replace(/^\[\s*[!.]\s*\]\s*/iu, '')(trimmed) || trimmed}
	}
	return {state: 'idle' as const, title: trimmed}
}
function terminalProgressStatus(value: string) {
	const progressState = Number.parseInt(value, 10)
	return pipe(
		Match.value(progressState),
		Match.when(0, () => 'idle' as const),
		Match.when(2, () => 'failed' as const),
		Match.when(4, () => 'waiting' as const),
		Match.orElse(() => 'running' as const)
	)
}
function terminalOscStart(parameters: {readonly input: string; readonly index: number}) {
	const code = parameters.input.charCodeAt(parameters.index)
	if (code === 0x9d) return {length: 1, payloadStart: parameters.index + 1}
	if (code === 0x1b && parameters.input[parameters.index + 1] === ']') {
		return {length: 2, payloadStart: parameters.index + 2}
	}
	return void 0
}
function terminalOscEnd(parameters: {readonly input: string; readonly payloadStart: number}) {
	const bell = pipe(
		String.slice(parameters.payloadStart)(parameters.input),
		String.indexOf('\u0007'),
		Option.map(index => index + parameters.payloadStart),
		Option.getOrElse(() => -1)
	)
	const st = pipe(
		String.slice(parameters.payloadStart)(parameters.input),
		String.indexOf('\u001b\\'),
		Option.map(index => index + parameters.payloadStart),
		Option.getOrElse(() => -1)
	)
	const c1St = pipe(
		String.slice(parameters.payloadStart)(parameters.input),
		String.indexOf('\u009c'),
		Option.map(index => index + parameters.payloadStart),
		Option.getOrElse(() => -1)
	)
	const candidates = Array.filter([bell, st, c1St], index => index !== -1)
	const end = Array.reduce(candidates, -1, (current, candidate) =>
		current === -1 || candidate < current ? candidate : current
	)
	if (end === -1) return
	return {index: end, length: end === st ? 2 : 1}
}
function terminalOscTitleUpdate(input: {readonly command: string; readonly value: string}) {
	if (input.command === '0' || input.command === '2') {
		const title = normalizeTerminalTitle(input.value)
		if (Predicate.isUndefined(title) && !terminalTitleActivity(input.value)) return
		return {state: terminalTitleActivity(input.value) ? ('running' as const) : undefined, title, type: 'title'} as const
	}
	if (input.command !== '9') return
	if (input.value === '3;') return {state: 'idle' as const, title: undefined, type: 'title'} as const
	if (!String.startsWith('3;')(input.value)) return
	const rawTitle = String.slice(2)(input.value)
	const title = normalizeTerminalTitle(rawTitle)
	if (Predicate.isUndefined(title) && !terminalTitleActivity(rawTitle)) return
	return {state: terminalTitleActivity(rawTitle) ? ('running' as const) : undefined, title, type: 'title'} as const
}
export function terminalOscUpdates(parameters: {readonly carry?: string; readonly data: string}) {
	const input = `${parameters.carry ?? ''}${parameters.data}`
	const scan = {
		index: 0,
		nextCarry: '',
		updates: Array.empty<
			| {
					readonly state: TerminalStatus['state'] | undefined
					readonly title: string | undefined
					readonly type: 'title'
			  }
			| {readonly state: TerminalStatus['state']; readonly type: 'progress'}
		>()
	}
	while (scan.index < input.length) {
		const start = terminalOscStart({index: scan.index, input})
		if (Predicate.isUndefined(start)) {
			if (input.charCodeAt(scan.index) === 0x1b && scan.index === input.length - 1) {
				scan.nextCarry = String.slice(scan.index)(input)
				break
			}
			scan.index += 1
			continue
		}
		const end = terminalOscEnd({input, payloadStart: start.payloadStart})
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
		const titleUpdate = terminalOscTitleUpdate({command, value})
		if (Predicate.isNotUndefined(titleUpdate)) scan.updates = Array.append(scan.updates, titleUpdate)
		if (command === '9' && String.startsWith('4;')(value)) {
			scan.updates = Array.append(scan.updates, {
				state: terminalProgressStatus(String.slice(2)(value)),
				type: 'progress'
			})
		}
		scan.index = end.index + end.length
	}
	return {carry: Buffer.byteLength(scan.nextCarry) > 4096 ? '' : scan.nextCarry, updates: scan.updates}
}
