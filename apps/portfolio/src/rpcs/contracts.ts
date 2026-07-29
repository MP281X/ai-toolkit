import {Effect, Schema, pipe} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type PortfolioVisitor = typeof PortfolioVisitor.Type
export const PortfolioVisitor = Schema.Struct({
	color: Schema.NonEmptyString,
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString,
	x: Schema.Finite,
	y: Schema.Finite
})

export type PortfolioTrail = typeof PortfolioTrail.Type
export const PortfolioTrail = Schema.Struct({
	color: Schema.NonEmptyString,
	visitorId: Schema.NonEmptyString,
	x: Schema.Finite,
	y: Schema.Finite
})

export type PortfolioState = typeof PortfolioState.Type
export const PortfolioState = Schema.Struct({
	trails: pipe(Schema.Array(PortfolioTrail), Schema.withConstructorDefault(Effect.succeed([]))),
	visitors: pipe(Schema.Array(PortfolioVisitor), Schema.withConstructorDefault(Effect.succeed([])))
})

export type PortfolioSnapshot = typeof PortfolioSnapshot.Type
export const PortfolioSnapshot = Schema.TaggedStruct('snapshot', {
	trails: Schema.Array(PortfolioTrail),
	visitors: Schema.Array(PortfolioVisitor)
})

export type PortfolioVisitorUpserted = typeof PortfolioVisitorUpserted.Type
export const PortfolioVisitorUpserted = Schema.TaggedStruct('visitor-upserted', {visitor: PortfolioVisitor})

export type PortfolioVisitorRemoved = typeof PortfolioVisitorRemoved.Type
export const PortfolioVisitorRemoved = Schema.TaggedStruct('visitor-removed', {id: Schema.NonEmptyString})

export type PortfolioTrailAdded = typeof PortfolioTrailAdded.Type
export const PortfolioTrailAdded = Schema.TaggedStruct('trail-added', {trail: PortfolioTrail})

const PortfolioEvent = Schema.Union([
	PortfolioSnapshot,
	PortfolioVisitorUpserted,
	PortfolioVisitorRemoved,
	PortfolioTrailAdded
])

export type PortfolioEvent = typeof PortfolioEvent.Type

export class RpcContracts extends RpcGroup.make(
	Rpc.make('portfolio.join', {
		payload: Schema.Struct({color: Schema.NonEmptyString, id: Schema.NonEmptyString, name: Schema.NonEmptyString}),
		stream: true,
		success: PortfolioEvent
	}),
	Rpc.make('portfolio.move', {
		payload: Schema.Struct({
			color: Schema.NonEmptyString,
			id: Schema.NonEmptyString,
			x: Schema.Finite,
			y: Schema.Finite
		})
	})
) {}
