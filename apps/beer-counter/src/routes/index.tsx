import {Array} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'

import {BeerMark, ReconnectingNotice, ThemeButton, positions, useStableCounter} from './-shared.tsx'

export const Route = createFileRoute('/')({component: ScoreboardRoute})

function ScoreboardRoute() {
	const counter = useStableCounter()

	return (
		<main className="scoreboard-shell">
			<header className="scoreboard-header">
				<div className="scoreboard-title">
					<div className="scoreboard-mark">
						<BeerMark />
					</div>
					<div className="min-w-0">
						<p className="eyebrow">Festival standings</p>
						<h1>Beer counter</h1>
					</div>
				</div>
				<div className="scoreboard-actions">
					<span className="team-total">{counter.teams.length} teams</span>
					<Link className="admin-link" to="/admin">
						Manage
					</Link>
					<ThemeButton />
				</div>
			</header>

			<section className="scoreboard-stage" aria-label="Team standings">
				<div className={`scoreboard-grid ${counter.teams.length > 12 ? 'scoreboard-grid--dense' : ''}`}>
					{Array.map(positions(counter.teams), item => (
						<article key={item.team.id} className="scoreboard-team">
							<div className="team-rank" aria-label={`Rank ${item.position}`}>
								<span>{item.position < 10 ? `0${item.position}` : item.position}</span>
							</div>
							<div className="team-main">
								<h2>{item.team.name}</h2>
								<div className="team-score">
									<strong>{item.team.count}</strong>
									<BeerMark />
								</div>
							</div>
						</article>
					))}
				</div>
			</section>

			<ReconnectingNotice connected={counter.connected} />
		</main>
	)
}
