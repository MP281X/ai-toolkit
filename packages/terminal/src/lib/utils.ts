import {Array, Match, Option, String, pipe} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

type SplitState = {
	readonly commands: readonly string[]
	readonly current: string
	readonly escaped: boolean
	readonly quote?: '"' | "'"
	readonly skipNext: boolean
}

export function splitParallelCommands(script: string) {
	const initialState: SplitState = {commands: [], current: '', escaped: false, skipNext: false}
	const state = pipe(
		String.split('')(script),
		Array.reduce(initialState, (current, char, index): SplitState => {
			if (current.skipNext) return {...current, skipNext: false}
			if (current.escaped) return {...current, current: current.current + char, escaped: false}
			if (char === '\\') return {...current, current: current.current + char, escaped: true}
			if (current.quote) {
				return {...current, current: current.current + char, quote: char === current.quote ? undefined : current.quote}
			}
			if (char === '"' || char === "'") {
				return {...current, current: current.current + char, quote: char}
			}
			if (char === '&' && script[index + 1] === '&') {
				return {...current, current: `${current.current}&&`, skipNext: true}
			}
			if (char !== '&') return {...current, current: current.current + char}

			return pipe(
				Option.liftPredicate(String.trim(current.current), String.isNonEmpty),
				Option.match({
					onNone: () => ({...current, current: ''}),
					onSome: command => ({...current, commands: [...current.commands, command], current: ''})
				})
			)
		})
	)

	return pipe(
		Option.liftPredicate(String.trim(state.current), String.isNonEmpty),
		Option.match({onNone: () => state.commands, onSome: command => [...state.commands, command]})
	)
}

export function commandFromScript(script: string) {
	const [command, args] = pipe(
		Match.value(/^vp\s+dev(?:\s|$)/u.test(script)),
		Match.when(true, () => ['vp', ['dev']] as const),
		Match.orElse(() => ['sh', ['-lc', script]] as const)
	)

	return ChildProcess.make(command, args)
}
