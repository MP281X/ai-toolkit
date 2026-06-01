import {Array, Option, String, pipe} from 'effect'

type SplitState = {
	readonly commands: readonly string[]
	readonly current: string
	readonly escaped: boolean
	readonly quote?: '"' | "'"
	readonly skipNext: boolean
}

export function splitParallelCommands(script: string) {
	const state = pipe(
		String.split('')(script),
		Array.reduce(
			{commands: [], current: '', escaped: false, skipNext: false} as SplitState,
			(state, char, index): SplitState => {
				if (state.skipNext) return {...state, skipNext: false}
				if (state.escaped) return {...state, current: state.current + char, escaped: false}
				if (char === '\\') return {...state, current: state.current + char, escaped: true}
				if (state.quote) {
					return {...state, current: state.current + char, quote: char === state.quote ? undefined : state.quote}
				}
				if (char === '"' || char === "'") {
					return {...state, current: state.current + char, quote: char as SplitState['quote']}
				}
				if (char === '&' && script[index + 1] === '&') {
					return {...state, current: `${state.current}&&`, skipNext: true}
				}
				if (char !== '&') return {...state, current: state.current + char}

				return pipe(
					Option.liftPredicate(String.trim(state.current), String.isNonEmpty),
					Option.match({
						onNone: () => ({...state, current: ''}),
						onSome: command => ({...state, commands: [...state.commands, command], current: ''})
					})
				)
			}
		)
	)

	return pipe(
		Option.liftPredicate(String.trim(state.current), String.isNonEmpty),
		Option.match({onNone: () => state.commands, onSome: command => [...state.commands, command]})
	)
}
