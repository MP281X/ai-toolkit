import {Effect, pipe, Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class PortfolioVisitor extends Schema.Class<PortfolioVisitor>('PortfolioVisitor')({
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString,
	color: Schema.NonEmptyString,
	x: Schema.Number,
	y: Schema.Number
}) {}

export class PortfolioTrail extends Schema.Class<PortfolioTrail>('PortfolioTrail')({
	visitorId: Schema.NonEmptyString,
	x: Schema.Number,
	y: Schema.Number,
	color: Schema.NonEmptyString
}) {}

export class PortfolioState extends Schema.Class<PortfolioState>('PortfolioState')({
	visitors: pipe(Schema.Array(PortfolioVisitor), Schema.withConstructorDefault(Effect.succeed([]))),
	trails: pipe(Schema.Array(PortfolioTrail), Schema.withConstructorDefault(Effect.succeed([])))
}) {}

export class PortfolioSnapshot extends Schema.TaggedClass<PortfolioSnapshot>()('snapshot', {
	visitors: Schema.Array(PortfolioVisitor),
	trails: Schema.Array(PortfolioTrail)
}) {}

export class PortfolioVisitorUpserted extends Schema.TaggedClass<PortfolioVisitorUpserted>()('visitor-upserted', {
	visitor: PortfolioVisitor
}) {}

export class PortfolioVisitorRemoved extends Schema.TaggedClass<PortfolioVisitorRemoved>()('visitor-removed', {
	id: Schema.NonEmptyString
}) {}

export class PortfolioTrailAdded extends Schema.TaggedClass<PortfolioTrailAdded>()('trail-added', {
	trail: PortfolioTrail
}) {}

export const PortfolioEvent = Schema.Union([
	PortfolioSnapshot,
	PortfolioVisitorUpserted,
	PortfolioVisitorRemoved,
	PortfolioTrailAdded
])

export type PortfolioEvent = typeof PortfolioEvent.Type

export class RpcContracts extends RpcGroup.make(
	Rpc.make('portfolio.join', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.NonEmptyString,
			color: Schema.NonEmptyString
		}),
		stream: true,
		success: PortfolioEvent
	}),
	Rpc.make('portfolio.move', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			x: Schema.Number,
			y: Schema.Number,
			color: Schema.NonEmptyString
		})
	})
) {}
