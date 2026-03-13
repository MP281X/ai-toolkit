import {Array, Duration, Effect, Option, pipe, Schedule, Stream, SubscriptionRef} from 'effect'

import {PortfolioContracts, PortfolioState, PortfolioTrail, PortfolioVisitor} from '#rpcs/portfolio/contracts.ts'

const botPalette = [
	'oklch(0.74 0.19 118)',
	'oklch(0.76 0.2 128)',
	'oklch(0.75 0.18 138)',
	'oklch(0.73 0.17 150)',
	'oklch(0.74 0.18 162)',
	'oklch(0.76 0.17 174)',
	'oklch(0.75 0.18 186)',
	'oklch(0.73 0.19 198)',
	'oklch(0.72 0.2 210)',
	'oklch(0.74 0.18 222)',
	'oklch(0.71 0.18 234)',
	'oklch(0.73 0.19 246)',
	'oklch(0.75 0.19 258)',
	'oklch(0.74 0.2 270)',
	'oklch(0.73 0.21 282)',
	'oklch(0.74 0.2 296)',
	'oklch(0.75 0.19 310)',
	'oklch(0.74 0.18 324)',
	'oklch(0.73 0.19 338)',
	'oklch(0.72 0.2 352)'
] as const

const SERVER_BOTS = [
	{
		id: 'server-alpha',
		name: 'server-alpha',
		color: botPalette[3],
		xFreq: 0.47,
		yFreq: 0.71,
		xPhase: 0,
		yPhase: 0
	},
	{
		id: 'server-beta',
		name: 'server-beta',
		color: botPalette[17],
		xFreq: 0.83,
		yFreq: 0.53,
		xPhase: Math.PI,
		yPhase: Math.PI / 2
	}
] as const

function botPosition(bot: (typeof SERVER_BOTS)[number], t: number) {
	return {
		x: Math.max(0.005, Math.min(0.995, 0.5 + 0.4 * Math.sin(t * bot.xFreq + bot.xPhase))),
		y: Math.max(0.005, Math.min(0.995, 0.5 + 0.4 * Math.cos(t * bot.yFreq + bot.yPhase)))
	}
}

function appendTrail(session: PortfolioState, trail: PortfolioTrail) {
	const allTrails = Array.append(session.trails, trail)
	return allTrails.length > 500 ? Array.drop(allTrails, allTrails.length - 500) : allTrails
}

function hasMeaningfulMove(current: {x: number; y: number}, next: {x: number; y: number}) {
	const deltaX = next.x - current.x
	const deltaY = next.y - current.y

	return deltaX * deltaX + deltaY * deltaY >= 0.0015 * 0.0015
}

function findVisitor(visitors: PortfolioState['visitors'], id: string) {
	for (const visitor of visitors) {
		if (visitor.id === id) return visitor
	}

	return
}

function upsertVisitor(visitors: PortfolioState['visitors'], visitor: PortfolioVisitor) {
	for (let index = 0; index < visitors.length; index++) {
		if (visitors[index]?.id !== visitor.id) continue

		const nextVisitors = Array.copy(visitors)
		nextVisitors[index] = visitor
		return nextVisitors
	}

	return Array.appendAll(visitors, [visitor])
}

function removeVisitor(visitors: PortfolioState['visitors'], id: string) {
	const nextVisitors = Array.empty<PortfolioVisitor>()
	let removed = false

	for (const visitor of visitors) {
		if (visitor.id === id) {
			removed = true
			continue
		}

		nextVisitors[nextVisitors.length] = visitor
	}

	return removed ? nextVisitors : visitors
}

export const PortfolioLive = PortfolioContracts.toLayer(
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(new PortfolioState({}))

		const start = Date.now()
		for (const bot of SERVER_BOTS) {
			yield* pipe(
				Effect.sync(() => botPosition(bot, (Date.now() - start) / 1000)),
				Effect.flatMap(pos =>
					SubscriptionRef.updateSome(state, session => {
						const currentBot = findVisitor(session.visitors, bot.id)
						if (currentBot && !hasMeaningfulMove(currentBot, pos)) return Option.none()

						const visitor = new PortfolioVisitor({id: bot.id, name: bot.name, color: bot.color, x: pos.x, y: pos.y})

						return Option.some(
							new PortfolioState({
								...session,
								visitors: upsertVisitor(session.visitors, visitor),
								trails: appendTrail(session, new PortfolioTrail({x: pos.x, y: pos.y, color: bot.color}))
							})
						)
					})
				),
				Effect.repeat(Schedule.spaced(Duration.millis(16))),
				Effect.forkDetach
			)
		}

		return PortfolioContracts.of({
			'portfolio.join': payload =>
				pipe(
					Stream.fromEffect(
						SubscriptionRef.update(state, session => {
							const visitors = upsertVisitor(
								session.visitors,
								new PortfolioVisitor({
									id: payload.id,
									name: payload.name,
									color: payload.color,
									x: 0.5,
									y: 0.5
								})
							)

							return new PortfolioState({...session, visitors})
						})
					),
					Stream.flatMap(() => SubscriptionRef.changes(state)),
					Stream.ensuring(
						SubscriptionRef.update(state, session => {
							const nextVisitors = removeVisitor(session.visitors, payload.id)

							if (nextVisitors.length === session.visitors.length) return session

							return new PortfolioState({
								...session,
								visitors: nextVisitors
							})
						})
					)
				),
			'portfolio.move': payload =>
				SubscriptionRef.updateSome(state, session => {
					const found = findVisitor(session.visitors, payload.id)
					if (found && !hasMeaningfulMove(found, payload)) return Option.none()

					const visitor = new PortfolioVisitor({
						id: payload.id,
						name: found?.name ?? 'Unknown',
						color: payload.color,
						x: payload.x,
						y: payload.y
					})

					return Option.some(
						new PortfolioState({
							...session,
							visitors: upsertVisitor(session.visitors, visitor),
							trails: appendTrail(session, new PortfolioTrail({x: payload.x, y: payload.y, color: payload.color}))
						})
					)
				})
		})
	})
)
