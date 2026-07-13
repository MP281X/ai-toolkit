import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute} from '@tanstack/react-router'

import {teamsAtom} from '#lib/teams.ts'
import {Beer} from '@deslop/components/icons'

export const Route = createFileRoute('/(home)/')({component: Scoreboard})

export function rankedTeams<T extends {readonly count: number; readonly order: number}>(teams: readonly T[]) {
	return [...teams].toSorted((left, right) => right.count - left.count || left.order - right.order)
}

function Scoreboard() {
	const teams = rankedTeams(useAtomSuspense(teamsAtom).value)

	return (
		<main className="scoreboard">
			{teams.map((team, index) => (
				<article className="scoreboard-team" key={team.id}>
					<span className="scoreboard-rank">{index + 1}</span>
					<div className="min-w-0">
						<h2 className="truncate font-bold">{team.name}</h2>
						<div className="scoreboard-count">
							<Beer aria-hidden="true" /> {team.count}
						</div>
					</div>
				</article>
			))}
		</main>
	)
}
