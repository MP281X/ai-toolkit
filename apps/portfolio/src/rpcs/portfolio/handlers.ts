import {Array, Effect, Option, pipe, Stream, SubscriptionRef} from 'effect'

import {PortfolioContracts, PortfolioState, PortfolioTrail, PortfolioVisitor} from '#rpcs/portfolio/contracts.ts'

const MAX_TRAILS = 500

export const PortfolioLive = PortfolioContracts.toLayer(
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(new PortfolioState({}))

		return PortfolioContracts.of({
			'portfolio.join': payload =>
				pipe(
					Stream.fromEffect(
						SubscriptionRef.update(state, session => {
							const visitors = pipe(
								Array.filter(session.visitors, v => v.id !== payload.id),
								Array.append(
									new PortfolioVisitor({
										id: payload.id,
										name: payload.name,
										color: payload.color,
										x: 0.5,
										y: 0.5
									})
								)
							)

							return new PortfolioState({...session, visitors})
						})
					),
					Stream.flatMap(() => SubscriptionRef.changes(state)),
					Stream.ensuring(
						SubscriptionRef.update(state, session => {
							const nextVisitors = Array.filter(session.visitors, v => v.id !== payload.id)

							if (nextVisitors.length === session.visitors.length) return session

							return new PortfolioState({
								...session,
								visitors: nextVisitors
							})
						})
					)
				),
			'portfolio.move': payload =>
				SubscriptionRef.update(state, session => {
					const found = Array.findFirst(session.visitors, v => v.id === payload.id)
					const visitorName = Option.isSome(found) ? found.value.name : 'Unknown'

					const visitors = pipe(
						Array.filter(session.visitors, v => v.id !== payload.id),
						Array.append(
							new PortfolioVisitor({
								id: payload.id,
								name: visitorName,
								color: payload.color,
								x: payload.x,
								y: payload.y
							})
						)
					)

					const trail = new PortfolioTrail({
						x: payload.x,
						y: payload.y,
						color: payload.color
					})

					const allTrails = Array.append(session.trails, trail)
					const trails =
						allTrails.length > MAX_TRAILS ? Array.drop(allTrails, allTrails.length - MAX_TRAILS) : allTrails

					return new PortfolioState({...session, visitors, trails})
				})
		})
	})
)
