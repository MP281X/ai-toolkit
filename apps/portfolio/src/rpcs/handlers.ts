import {Array, Clock, Duration, Effect, Option, PubSub, Schedule, Stream, SubscriptionRef, pipe} from 'effect'

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
	{color: botPalette[3], id: 'server-alpha', name: 'server-alpha', xFreq: 0.47, xPhase: 0, yFreq: 0.71, yPhase: 0},
	{
		color: botPalette[17],
		id: 'server-beta',
		name: 'server-beta',
		xFreq: 0.83,
		xPhase: Math.PI,
		yFreq: 0.53,
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
function hasMeaningfulMove(
	current: {readonly x: number; readonly y: number},
	next: {readonly x: number; readonly y: number}
) {
	const deltaX = next.x - current.x
	const deltaY = next.y - current.y
	return deltaX * deltaX + deltaY * deltaY >= 0.0025 * 0.0025
}
function findVisitor(visitors: PortfolioState['visitors'], id: string) {
	return pipe(
		visitors,
		Array.findFirst(visitor => visitor.id === id),
		Option.getOrUndefined
	)
}
function upsertVisitor(visitors: PortfolioState['visitors'], visitor: PortfolioVisitor) {
	return Array.some(visitors, current => current.id === visitor.id)
		? Array.map(visitors, current => (current.id === visitor.id ? visitor : current))
		: Array.append(visitors, visitor)
}
function removeVisitor(visitors: PortfolioState['visitors'], id: string) {
	const nextVisitors = Array.filter(visitors, visitor => visitor.id !== id)
	return {removed: nextVisitors.length !== visitors.length, visitors: nextVisitors}
}
function createVisitorTrailUpdate(state: PortfolioState, visitor: PortfolioVisitor) {
	const trail = PortfolioTrail.make({color: visitor.color, visitorId: visitor.id, x: visitor.x, y: visitor.y})
	return {
		state: PortfolioState.make({
			trails: appendTrail(state.trails, trail),
			visitors: upsertVisitor(state.visitors, visitor)
		}),
		trail
	}
}
export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(PortfolioState.make({}))
		const events = yield* PubSub.unbounded<
			PortfolioSnapshot | PortfolioVisitorUpserted | PortfolioVisitorRemoved | PortfolioTrailAdded
		>()
		const start = yield* Clock.currentTimeMillis
		for (const bot of SERVER_BOTS) {
			yield* Effect.forkScoped(
				Effect.repeat(
					Effect.gen(function* () {
						const now = yield* Clock.currentTimeMillis
						const pos = botPosition(bot, (now - start) / 1000)
						const visitor = PortfolioVisitor.make({color: bot.color, id: bot.id, name: bot.name, x: pos.x, y: pos.y})
						const next = yield* SubscriptionRef.modify(state, currentState => {
							const currentBot = findVisitor(currentState.visitors, bot.id)
							if (currentBot && !hasMeaningfulMove(currentBot, pos)) {
								return [undefined, currentState] as const
							}
							const nextState = createVisitorTrailUpdate(currentState, visitor)
							return [nextState, nextState.state] as const
						})
						if (!next) return
						yield* PubSub.publish(events, PortfolioVisitorUpserted.make({visitor}))
						yield* PubSub.publish(events, PortfolioTrailAdded.make({trail: next.trail}))
					}),
					Schedule.spaced(Duration.millis(55))
				)
			)
		}
		return RpcContracts.of({
			'portfolio.join': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const visitor = PortfolioVisitor.make({
							color: payload.color,
							id: payload.id,
							name: payload.name,
							x: 0.5,
							y: 0.5
						})
						const joinedState = yield* SubscriptionRef.modify(state, currentState => {
							const nextState = PortfolioState.make({
								trails: currentState.trails,
								visitors: upsertVisitor(currentState.visitors, visitor)
							})
							return [nextState, nextState] as const
						})
						yield* PubSub.publish(events, PortfolioVisitorUpserted.make({visitor}))
						return pipe(
							Stream.make(PortfolioSnapshot.make({trails: joinedState.trails, visitors: joinedState.visitors})),
							Stream.concat(Stream.fromPubSub(events)),
							Stream.ensuring(
								Effect.gen(function* () {
									const nextVisitors = yield* SubscriptionRef.modify(state, latestState => {
										const removedVisitors = removeVisitor(latestState.visitors, payload.id)
										if (!removedVisitors.removed) return [removedVisitors, latestState] as const
										const nextState = PortfolioState.make({
											trails: latestState.trails,
											visitors: removedVisitors.visitors
										})
										return [removedVisitors, nextState] as const
									})
									if (!nextVisitors.removed) return
									yield* PubSub.publish(events, PortfolioVisitorRemoved.make({id: payload.id}))
								})
							)
						)
					})
				),
			'portfolio.move': Effect.fn('PortfolioRpc.move')(function* (payload) {
				const visitor = yield* SubscriptionRef.modify(state, currentState => {
					const found = findVisitor(currentState.visitors, payload.id)
					if (found && !hasMeaningfulMove(found, payload)) return [undefined, currentState] as const
					const nextVisitor = PortfolioVisitor.make({
						color: payload.color,
						id: payload.id,
						name: found?.name ?? 'Unknown',
						x: payload.x,
						y: payload.y
					})
					const next = createVisitorTrailUpdate(currentState, nextVisitor)
					return [[nextVisitor, next.trail] as const, next.state] as const
				})
				if (!visitor) return
				yield* PubSub.publish(events, PortfolioVisitorUpserted.make({visitor: visitor[0]}))
				yield* PubSub.publish(events, PortfolioTrailAdded.make({trail: visitor[1]}))
			})
		})
	})
)
