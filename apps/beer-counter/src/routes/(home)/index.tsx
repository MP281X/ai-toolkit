import {useAtomSuspense} from '@effect/atom-react'

import {Array, String, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {beerStateAtom} from '#lib/state.ts'
import type {Team} from '#rpcs/contracts.ts'
import {Beer} from '@deslop/components/icons'

export const Route = createFileRoute('/(home)/')({component: HomeRoute})

function rankedTeams(teams: readonly Team[]) {
	return [...teams].toSorted((left, right) => right.count - left.count || left.createdOrder - right.createdOrder)
}

function gridColumns(teamCount: number) {
	if (teamCount <= 12) return 4
	if (teamCount <= 20) return 5
	if (teamCount <= 30) return 6
	return Math.ceil(Math.sqrt((teamCount * 4) / 3))
}

function HomeRoute() {
	const state = useAtomSuspense(beerStateAtom)
	const teams = rankedTeams(state.value.teams)
	const columns = gridColumns(teams.length)
	const rows = Math.max(1, Math.ceil(teams.length / columns))
	const scale = Math.max(0.56, Math.min(1, 12 / teams.length))
	const scoreboardStyle = {
		gap: `${Math.max(0.25, 0.75 * scale)}rem`,
		gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
		gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
	}

	return (
		<main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
			<header className="mb-3 flex shrink-0 items-end justify-between border-b pb-2 sm:mb-4">
				<div>
					<p className="text-primary text-[10px] font-semibold tracking-[0.2em] uppercase">Festival standings</p>
					<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Beer counter</h1>
				</div>
				<Beer aria-hidden="true" className="text-primary size-7 sm:size-9" />
			</header>

			{teams.length === 0 ? (
				<div className="text-muted-foreground grid min-h-0 flex-1 place-items-center border text-sm">No teams yet.</div>
			) : (
				<ol
					className="scoreboard-grid min-h-0 flex-1 overflow-y-auto sm:grid sm:overflow-hidden"
					style={scoreboardStyle}
				>
					{pipe(
						teams,
						Array.map((team, index) => (
							<li key={team.id} className="scoreboard-team border-border flex min-w-0 items-center border p-3 sm:p-2">
								<span className="text-primary w-9 shrink-0 text-lg font-semibold tabular-nums sm:self-start">
									{pipe(index + 1, String.String, String.padStart(2, '0'))}
								</span>
								<div className="min-w-0 flex-1 sm:flex sm:h-full sm:flex-col sm:justify-between">
									<p className="truncate text-base font-semibold" style={{fontSize: `${1.25 * scale}rem`}}>
										{team.name}
									</p>
									<div className="flex items-center justify-end gap-2">
										<span
											className="text-2xl leading-none font-bold tabular-nums"
											style={{fontSize: `${3 * scale}rem`}}
										>
											{team.count}
										</span>
										<Beer
											aria-hidden="true"
											className="text-primary size-5"
											style={{height: `${1.6 * scale}rem`, width: `${1.6 * scale}rem`}}
										/>
									</div>
								</div>
							</li>
						))
					)}
				</ol>
			)}
		</main>
	)
}
