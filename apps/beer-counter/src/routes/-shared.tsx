import {useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Order, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {BeerCounterState, type Team} from '#rpcs/contracts.ts'
import {Beer, Moon, Sun} from '@deslop/components/icons'
import {Button} from '@deslop/components/ui/button'

export const scoreboardAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('scoreboard.watch', void 0)),
			Stream.unwrap,
			Stream.scan(BeerCounterState.make({teams: []}), (_, latest) => latest)
		)
	)
)

export function useRankedTeams() {
	return Array.sort(
		useAtomSuspense(scoreboardAtom).value.teams,
		Order.make<Team>((left, right) => {
			if (left.count !== right.count) return left.count > right.count ? -1 : 1
			if (left.createdAt === right.createdAt) return 0
			return left.createdAt < right.createdAt ? -1 : 1
		})
	)
}

export function ThemeButton() {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
	function toggle() {
		document.documentElement.classList.toggle('dark', !dark)
		localStorage.setItem('beer-counter.theme', dark ? 'light' : 'dark')
		setDark(!dark)
	}
	return (
		<Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>
			{dark ? <Sun /> : <Moon />}
		</Button>
	)
}

export function BeerMark(props: {readonly className?: string}) {
	return <Beer aria-hidden="true" className={props.className ?? ''} />
}
