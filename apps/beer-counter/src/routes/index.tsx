import {Array} from 'effect'

import {createFileRoute, Link} from '@tanstack/react-router'

import {BeerMark, ReconnectingNotice, ThemeButton, positions, useStableCounter} from './-shared.tsx'

export const Route = createFileRoute('/')({component: ScoreboardRoute})

function ScoreboardRoute() {
	const counter = useStableCounter()
	const ranked = positions(counter.teams)

	return (
		<main className="bg-background text-foreground flex h-dvh w-dvw flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
			<header className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b pb-3 sm:mb-4 sm:pb-4">
				<div className="flex min-w-0 items-center gap-3">
					<BeerMark className="size-7 sm:size-9" />
					<div className="min-w-0">
						<h1 className="truncate text-xl font-black tracking-tight uppercase sm:text-3xl lg:text-5xl">
							Festival beer counter
						</h1>
						<p className="text-muted-foreground text-xs uppercase sm:text-sm">
							{counter.teams.length} teams · ranked by beers
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						className="border-border text-muted-foreground hover:text-foreground hidden border px-3 py-2 text-xs uppercase sm:block"
						to="/admin"
					>
						admin
					</Link>
					<ThemeButton />
				</div>
			</header>

			<section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden">
				<div
					className={`grid min-h-full gap-2 sm:gap-3 ${counter.teams.length > 12 ? 'lg:grid-cols-5 xl:grid-cols-6' : 'lg:grid-cols-4'} auto-rows-fr`}
				>
					{Array.map(ranked, item => (
						<article
							key={item.team.id}
							className="bg-card text-card-foreground flex min-h-20 items-center gap-3 border p-3 sm:p-4 lg:min-h-0 lg:flex-col lg:items-start lg:justify-between"
						>
							<div className="flex w-full min-w-0 items-center justify-between gap-3">
								<span className="text-primary text-2xl font-black sm:text-4xl lg:text-5xl">#{item.position}</span>
								<BeerMark className="size-6 sm:size-8" />
							</div>
							<div className="min-w-0 flex-1 lg:w-full">
								<h2
									className={`truncate font-black uppercase ${counter.teams.length > 12 ? 'text-xl lg:text-2xl' : 'text-2xl sm:text-4xl lg:text-5xl'}`}
								>
									{item.team.name}
								</h2>
								<p
									className={`text-foreground mt-1 font-black tabular-nums ${counter.teams.length > 12 ? 'text-3xl lg:text-5xl' : 'text-4xl sm:text-6xl lg:text-7xl'}`}
								>
									{item.team.count}
								</p>
							</div>
						</article>
					))}
				</div>
			</section>

			<ReconnectingNotice connected={counter.connected} />
		</main>
	)
}
