import {useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Stream, pipe} from 'effect'

import {Atom, AsyncResult} from 'effect/unstable/reactivity'
import {useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {CounterState, type CounterEvent, type Team} from '#rpcs/contracts.ts'
import {Beer, Moon, Sun} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'
import {cn} from '@deslop/components/utils'

function applyCounterEvent(_state: typeof CounterState.Type, event: CounterEvent) {
	return pipe(
		Match.value(event),
		Match.tag('snapshot', next => CounterState.make({teams: next.teams})),
		Match.tag('changed', next => CounterState.make({teams: next.teams})),
		Match.exhaustive
	)
}

const counterAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('counter.watch', void 0)),
			Stream.unwrap,
			Stream.scan(CounterState.make({teams: []}), applyCounterEvent)
		)
	)
)

export function useStableCounter() {
	const result = useAtomSuspense(counterAtom, {includeFailure: true})
	const [lastTeams, setLastTeams] = useState<readonly Team[]>([])
	const connected = AsyncResult.isSuccess(result)

	useEffect(() => {
		if (!AsyncResult.isSuccess(result)) return
		const frame = requestAnimationFrame(() => {
			setLastTeams(result.value.teams)
		})
		return () => {
			cancelAnimationFrame(frame)
		}
	}, [result])

	return {connected, teams: connected ? result.value.teams : lastTeams}
}

export function ThemeButton() {
	const [theme, setTheme] = useState<'dark' | 'light'>(() => {
		const stored = localStorage.getItem('beer-counter.theme')
		if (stored === 'dark' || stored === 'light') return stored
		return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	})

	useEffect(() => {
		document.documentElement.classList.toggle('dark', theme === 'dark')
		localStorage.setItem('beer-counter.theme', theme)
	}, [theme])

	return (
		<Button
			aria-label="Toggle theme"
			className="size-10 border"
			size="icon"
			variant="ghost"
			onClick={() => {
				setTheme(current => (current === 'dark' ? 'light' : 'dark'))
			}}
		>
			{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</Button>
	)
}

export function ReconnectingNotice(props: {readonly connected: boolean}) {
	const [online, setOnline] = useState(() => navigator.onLine)

	useEffect(() => {
		function refresh() {
			setOnline(navigator.onLine)
		}

		window.addEventListener('online', refresh)
		window.addEventListener('offline', refresh)
		return () => {
			window.removeEventListener('online', refresh)
			window.removeEventListener('offline', refresh)
		}
	}, [])

	if (props.connected && online) return null
	return (
		<div className="border-primary text-primary bg-background fixed right-3 bottom-3 z-50 border px-3 py-1.5 text-xs">
			reconnecting…
		</div>
	)
}

export function BeerMark(props: {readonly className?: string}) {
	return <Beer className={cn('text-primary shrink-0', props.className)} />
}

export function positions(teams: readonly Team[]) {
	return Array.map(teams, (team, index) => ({position: index + 1, team}))
}
