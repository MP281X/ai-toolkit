import {Option, Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class RealtimeCursor extends Schema.Class<RealtimeCursor>('RealtimeCursor')({
	id: Schema.NonEmptyString,
	name: Schema.NonEmptyString,
	color: Schema.NonEmptyString,
	x: Schema.Number,
	y: Schema.Number,
	at: Schema.Number
}) {}

export class RealtimePixel extends Schema.Class<RealtimePixel>('RealtimePixel')({
	x: Schema.Number,
	y: Schema.Number,
	color: Schema.NonEmptyString,
	by: Schema.NonEmptyString,
	at: Schema.Number
}) {}

export class RealtimeSession extends Schema.Class<RealtimeSession>('RealtimeSession')({
	width: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(28))),
	height: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(20))),
	cursors: Schema.Array(RealtimeCursor).pipe(Schema.withConstructorDefault(() => Option.some([] as const))),
	pixels: Schema.Array(RealtimePixel).pipe(Schema.withConstructorDefault(() => Option.some([] as const))),
	at: Schema.Number.pipe(Schema.withConstructorDefault(() => Option.some(Date.now())))
}) {}

export class RealtimeContracts extends RpcGroup.make(
	Rpc.make('realtime.session', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.NonEmptyString,
			color: Schema.NonEmptyString
		}),
		stream: true,
		success: RealtimeSession
	}),
	Rpc.make('realtime.moveCursor', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.NonEmptyString,
			color: Schema.NonEmptyString,
			x: Schema.Number,
			y: Schema.Number
		})
	}),
	Rpc.make('realtime.paintPixel', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.NonEmptyString,
			color: Schema.NonEmptyString,
			x: Schema.Number,
			y: Schema.Number,
			pixelColor: Schema.NonEmptyString
		})
	}),
	Rpc.make('realtime.clearCanvas', {
		payload: Schema.Struct({
			id: Schema.NonEmptyString,
			name: Schema.NonEmptyString,
			color: Schema.NonEmptyString
		})
	})
) {}
