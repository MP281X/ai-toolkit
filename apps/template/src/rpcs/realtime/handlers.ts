import {Effect, pipe, Stream, SubscriptionRef} from 'effect'

import {RealtimeContracts, RealtimeCursor, RealtimePixel, RealtimeSession} from '#rpcs/realtime/contracts.ts'

export const RealtimeLive = RealtimeContracts.toLayer(
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(new RealtimeSession({}))

		return RealtimeContracts.of({
			'realtime.session': payload =>
				pipe(
					Stream.fromEffect(
						SubscriptionRef.update(state, session => {
							const now = Date.now()
							const cursors = session.cursors.filter(item => item.id !== payload.id)

							cursors.push(
								new RealtimeCursor({
									id: payload.id,
									name: payload.name,
									color: payload.color,
									x: session.width / 2,
									y: session.height / 2,
									at: now
								})
							)

							return new RealtimeSession({
								...session,
								cursors,
								at: now
							})
						})
					),
					Stream.flatMap(() => SubscriptionRef.changes(state)),
					Stream.ensuring(
						SubscriptionRef.update(state, session => {
							const nextCursors = session.cursors.filter(item => item.id !== payload.id)

							if (nextCursors.length === session.cursors.length) {
								return session
							}

							return new RealtimeSession({
								...session,
								cursors: nextCursors,
								at: Date.now()
							})
						})
					)
				),
			'realtime.moveCursor': payload =>
				SubscriptionRef.update(state, session => {
					const now = Date.now()
					const x = Math.max(0, Math.min(session.width - 0.001, payload.x))
					const y = Math.max(0, Math.min(session.height - 0.001, payload.y))
					const cursors = session.cursors.filter(item => item.id !== payload.id)

					cursors.push(
						new RealtimeCursor({
							id: payload.id,
							name: payload.name,
							color: payload.color,
							x,
							y,
							at: now
						})
					)

					return new RealtimeSession({
						...session,
						cursors,
						at: now
					})
				}),
			'realtime.paintPixel': payload =>
				SubscriptionRef.update(state, session => {
					const now = Date.now()
					const cursorX = Math.max(0, Math.min(session.width - 0.001, payload.x))
					const cursorY = Math.max(0, Math.min(session.height - 0.001, payload.y))
					const x = Math.floor(cursorX)
					const y = Math.floor(cursorY)
					const pixel = new RealtimePixel({
						x,
						y,
						color: payload.pixelColor,
						by: payload.id,
						at: now
					})
					const cursors = session.cursors.filter(item => item.id !== payload.id)

					cursors.push(
						new RealtimeCursor({
							id: payload.id,
							name: payload.name,
							color: payload.color,
							x: cursorX,
							y: cursorY,
							at: now
						})
					)

					const hasPixel = session.pixels.some(item => item.x === x && item.y === y)
					const pixels = hasPixel
						? session.pixels.map(item => (item.x === x && item.y === y ? pixel : item))
						: [...session.pixels, pixel]

					return new RealtimeSession({
						...session,
						pixels,
						cursors,
						at: now
					})
				}),
			'realtime.clearCanvas': payload =>
				SubscriptionRef.update(state, session => {
					const now = Date.now()
					const existing = session.cursors.find(item => item.id === payload.id)
					const cursors = session.cursors.filter(item => item.id !== payload.id)

					cursors.push(
						new RealtimeCursor({
							id: payload.id,
							name: payload.name,
							color: payload.color,
							x: existing?.x ?? session.width / 2,
							y: existing?.y ?? session.height / 2,
							at: now
						})
					)

					return new RealtimeSession({
						...session,
						pixels: [],
						cursors,
						at: now
					})
				})
		})
	})
)
