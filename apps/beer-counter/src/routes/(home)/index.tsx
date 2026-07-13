import {String, pipe} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'
import {Suspense} from 'react'

import {BeerMark, ThemeButton, useRankedTeams} from '#routes/-shared.tsx'

export const Route = createFileRoute('/(home)/')({component: ScoreboardPage})

function ScoreboardPage() {
	return (
		<main className="scoreboard-shell">
			<header className="scoreboard-header">
				<div>
					<p className="eyebrow">Festival standings</p>
					<h1>Beer counter</h1>
				</div>
				<div className="header-actions">
					<Link to="/admin" className="admin-link">
						Admin
					</Link>
					<ThemeButton />
				</div>
			</header>
			<Suspense fallback={<div className="scoreboard-loading">Loading scoreboard…</div>}>
				<Scoreboard />
			</Suspense>
		</main>
	)
}

function Scoreboard() {
	const teams = useRankedTeams()
	return (
		<ol className="scoreboard-grid">
			{teams.map((team, index) => (
				<li className="score-card" key={team.id}>
					<span className="rank">{pipe(`${index + 1}`, String.padStart(2, '0'))}</span>
					<div className="team-name">{team.name}</div>
					<div className="beer-count">
						<BeerMark />
						<strong>{team.count}</strong>
					</div>
				</li>
			))}
		</ol>
	)
}
