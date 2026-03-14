import {Array, Duration, Effect, Option, PubSub, pipe, Schedule, Stream, SubscriptionRef} from 'effect'

import {
	PortfolioSnapshot,
	PortfolioState,
	PortfolioTrail,
	PortfolioTrailAdded,
	PortfolioVisitor,
	PortfolioVisitorRemoved,
	PortfolioVisitorUpserted,
	RpcContracts
} from '#rpcs/contracts.ts'

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

function appendTrail(trails: PortfolioState['trails'], trail: PortfolioTrail) {
	const allTrails = Array.append(trails, trail)
	return allTrails.length > 180 ? Array.drop(allTrails, allTrails.length - 180) : allTrails
}

function hasMeaningfulMove(current: {x: number; y: number}, next: {x: number; y: number}) {
	const deltaX = next.x - current.x
	const deltaY = next.y - current.y

	return deltaX * deltaX + deltaY * deltaY >= 0.0025 * 0.0025
}

function findVisitor(visitors: PortfolioState['visitors'], id: string) {
	for (const visitor of visitors) {
		if (visitor.id === id) return visitor
	}
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

	return {removed, visitors: removed ? nextVisitors : visitors}
}

function createVisitorTrailUpdate(state: PortfolioState, visitor: PortfolioVisitor) {
	const trail = new PortfolioTrail({visitorId: visitor.id, x: visitor.x, y: visitor.y, color: visitor.color})

	return {
		trail,
		state: new PortfolioState({
			visitors: upsertVisitor(state.visitors, visitor),
			trails: appendTrail(state.trails, trail)
		})
	}
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(new PortfolioState({}))
		const events = yield* PubSub.unbounded<
			PortfolioSnapshot | PortfolioVisitorUpserted | PortfolioVisitorRemoved | PortfolioTrailAdded
		>()

		const start = Date.now()
		for (const bot of SERVER_BOTS) {
			yield* Effect.forkScoped(
				Effect.repeat(
					Effect.gen(function* () {
						const pos = botPosition(bot, (Date.now() - start) / 1000)
						const visitor = new PortfolioVisitor({id: bot.id, name: bot.name, color: bot.color, x: pos.x, y: pos.y})
						const next = yield* SubscriptionRef.modifySome(state, currentState => {
							const currentBot = findVisitor(currentState.visitors, bot.id)
							if (currentBot && !hasMeaningfulMove(currentBot, pos)) return [undefined, Option.none()] as const

							const nextState = createVisitorTrailUpdate(currentState, visitor)
							return [nextState, Option.some(nextState.state)] as const
						})
						if (!next) return

						yield* PubSub.publish(events, new PortfolioVisitorUpserted({visitor}))
						yield* PubSub.publish(events, new PortfolioTrailAdded({trail: next.trail}))
					}),
					Schedule.spaced(Duration.millis(55))
				)
			)
		}

		return RpcContracts.of({
			'portfolio.join': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const visitor = new PortfolioVisitor({
							id: payload.id,
							name: payload.name,
							color: payload.color,
							x: 0.5,
							y: 0.5
						})
						const joinedState = yield* SubscriptionRef.modify(state, currentState => {
							const nextState = new PortfolioState({
								visitors: upsertVisitor(currentState.visitors, visitor),
								trails: currentState.trails
							})

							return [nextState, nextState] as const
						})
						yield* PubSub.publish(events, new PortfolioVisitorUpserted({visitor}))

						return pipe(
							Stream.make(new PortfolioSnapshot({visitors: joinedState.visitors, trails: joinedState.trails})),
							Stream.concat(Stream.fromPubSub(events)),
							Stream.ensuring(
								Effect.gen(function* () {
									const nextVisitors = yield* SubscriptionRef.modify(state, latestState => {
										const removedVisitors = removeVisitor(latestState.visitors, payload.id)
										if (!removedVisitors.removed) return [removedVisitors, latestState] as const

										const nextState = new PortfolioState({
											visitors: removedVisitors.visitors,
											trails: latestState.trails
										})

										return [removedVisitors, nextState] as const
									})
									if (!nextVisitors.removed) return
									yield* PubSub.publish(events, new PortfolioVisitorRemoved({id: payload.id}))
								})
							)
						)
					})
				),
			'portfolio.move': payload =>
				Effect.gen(function* () {
					const visitor = yield* SubscriptionRef.modifySome(state, currentState => {
						const found = findVisitor(currentState.visitors, payload.id)
						if (found && !hasMeaningfulMove(found, payload)) return [undefined, Option.none()] as const

						const nextVisitor = new PortfolioVisitor({
							id: payload.id,
							name: found?.name ?? 'Unknown',
							color: payload.color,
							x: payload.x,
							y: payload.y
						})
						const next = createVisitorTrailUpdate(currentState, nextVisitor)

						return [[nextVisitor, next.trail] as const, Option.some(next.state)] as const
					})
					if (!visitor) return

					yield* PubSub.publish(events, new PortfolioVisitorUpserted({visitor: visitor[0]}))
					yield* PubSub.publish(events, new PortfolioTrailAdded({trail: visitor[1]}))
				})
		})
	})
)
