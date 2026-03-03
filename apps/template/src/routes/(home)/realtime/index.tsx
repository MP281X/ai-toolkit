import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, pipe, Stream} from 'effect'

import {Brush, Crosshair, MousePointer2, Palette, Users, Zap} from '@ai-toolkit/components/icons'
import {Badge} from '@ai-toolkit/components/ui/badge'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {cn} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useRef, useState} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'
import {RealtimeSession} from '#rpcs/realtime/contracts.ts'

export const Route = createFileRoute('/(home)/realtime/')({
	component: RouteComponent
})

const sessionAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('realtime.session', getIdentity())),
			Stream.unwrap
		)
	)
)

const palette = ['#0b0b0b', '#f97316', '#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#8b5cf6', '#ffffff']

function getIdentity() {
	if (typeof window === 'undefined') {
		return {id: 'server', name: 'Server', color: '#f97316'}
	}

	const existingId = window.sessionStorage.getItem('realtime.demo.id')
	const existingName = window.sessionStorage.getItem('realtime.demo.name')
	const existingColor = window.sessionStorage.getItem('realtime.demo.color')

	if (existingId && existingName && existingColor) return {id: existingId, name: existingName, color: existingColor}

	const seed = Math.random().toString(36).slice(2, 8)
	const next = {
		id: `user-${seed}`,
		name: `Pilot-${seed.slice(0, 3)}`,
		color: palette[seed.length % palette.length] ?? '#f97316'
	}

	window.sessionStorage.setItem('realtime.demo.id', next.id)
	window.sessionStorage.setItem('realtime.demo.name', next.name)
	window.sessionStorage.setItem('realtime.demo.color', next.color)

	return next
}

function RouteComponent() {
	const {value: streamedSession} = useAtomSuspense(sessionAtom)
	const session = streamedSession ?? new RealtimeSession({})
	const [identity] = useState(() => getIdentity())
	const moveCursor = useAtomSet(RpcClient.mutation('realtime.moveCursor'))
	const paintPixel = useAtomSet(RpcClient.mutation('realtime.paintPixel'))
	const clearCanvas = useAtomSet(RpcClient.mutation('realtime.clearCanvas'))
	const [paintColor, setPaintColor] = useState('#f97316')
	const [, rerender] = useState(0)
	const optimisticPixelsRef = useRef<Record<string, string>>({})
	const drawingRef = useRef(false)
	const lastPaintKeyRef = useRef('')
	const lastCursorSentAtRef = useRef(0)

	const actor = {
		id: identity.id,
		name: identity.name,
		color: identity.color
	}

	const pixelMap = new Map(session.pixels.map(pixel => [`${pixel.x}:${pixel.y}`, pixel.color]))

	for (const key in optimisticPixelsRef.current) {
		const optimisticColor = optimisticPixelsRef.current[key]
		if (optimisticColor == null) continue
		if (pixelMap.get(key) === optimisticColor) delete optimisticPixelsRef.current[key]
	}

	const remoteCursors = session.cursors.filter(cursor => cursor.id !== identity.id)

	function getBoardPoint(event: React.PointerEvent<HTMLDivElement>) {
		const rect = event.currentTarget.getBoundingClientRect()
		const x = Math.max(0, Math.min(session.width - 0.001, ((event.clientX - rect.left) / rect.width) * session.width))
		const y = Math.max(0, Math.min(session.height - 0.001, ((event.clientY - rect.top) / rect.height) * session.height))

		return {x, y, key: `${Math.floor(x)}:${Math.floor(y)}`}
	}

	function sendCursor(point: {x: number; y: number}, force = false) {
		const now = Date.now()
		if (!force && now - lastCursorSentAtRef.current < 16) return

		lastCursorSentAtRef.current = now
		moveCursor({payload: {...actor, x: point.x, y: point.y}})
	}

	function paint(point: {x: number; y: number; key: string}) {
		if (point.key === lastPaintKeyRef.current) return

		if (optimisticPixelsRef.current[point.key] !== paintColor) {
			optimisticPixelsRef.current[point.key] = paintColor
			rerender(value => value + 1)
		}

		paintPixel({payload: {...actor, x: point.x, y: point.y, pixelColor: paintColor}})
		lastPaintKeyRef.current = point.key
	}

	function stopDrawing(event?: React.PointerEvent<HTMLDivElement>) {
		if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}

		drawingRef.current = false
		lastPaintKeyRef.current = ''
	}

	return (
		<div className="h-full w-full overflow-auto bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
				<Card size="sm" className="border">
					<CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div className="space-y-1">
							<CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.2em]">
								<Zap className="size-4 text-orange-500" />
								Realtime Shared Canvas
							</CardTitle>
							<CardDescription className="font-mono text-xs">
								Move and paint. Every connected user sees the same board.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" className="font-mono uppercase">
								{session.width}x{session.height}
							</Badge>
							<Badge variant="secondary" className="font-mono uppercase">
								{session.cursors.length} users
							</Badge>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => {
									optimisticPixelsRef.current = {}
									rerender(value => value + 1)
									clearCanvas({payload: actor})
								}}
							>
								Clear Canvas
							</Button>
						</div>
					</CardHeader>
				</Card>

				<section className="grid gap-4 xl:grid-cols-[1fr_20rem]">
					<Card className="border">
						<CardHeader className="flex items-center justify-between border-b">
							<CardTitle className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-wider">
								<Brush className="size-3.5" />
								Board
							</CardTitle>
							<CardDescription className="font-mono text-xs">{session.pixels.length} painted pixels</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<div
								className="relative cursor-crosshair select-none border bg-card"
								onPointerMove={event => {
									const point = getBoardPoint(event)
									sendCursor(point)

									if (drawingRef.current) {
										paint(point)
									}
								}}
								onPointerDown={event => {
									event.currentTarget.setPointerCapture(event.pointerId)
									drawingRef.current = true
									const point = getBoardPoint(event)
									sendCursor(point, true)
									paint(point)
								}}
								onPointerUp={event => stopDrawing(event)}
								onPointerCancel={() => stopDrawing()}
								onPointerLeave={() => stopDrawing()}
							>
								<div
									className="grid aspect-14/10 w-full"
									style={{gridTemplateColumns: `repeat(${session.width}, minmax(0, 1fr))`}}
								>
									{Array.makeBy(session.width * session.height, index => {
										const x = index % session.width
										const y = Math.floor(index / session.width)
										const key = `${x}:${y}`

										return (
											<div
												key={key}
												className="border-foreground/10 border-r border-b"
												style={{
													backgroundColor: optimisticPixelsRef.current[key] ?? pixelMap.get(key) ?? 'var(--color-card)'
												}}
											/>
										)
									})}
								</div>

								{remoteCursors.map(cursor => (
									<div
										key={cursor.id}
										className="pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-linear"
										style={{
											left: `${(cursor.x / session.width) * 100}%`,
											top: `${(cursor.y / session.height) * 100}%`
										}}
									>
										<div className="flex items-center gap-1">
											<MousePointer2 className="size-4" style={{color: cursor.color}} />
											<span className="border bg-background px-1 py-0.5 font-mono text-[10px]">{cursor.name}</span>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<aside className="flex flex-col gap-4">
						<Card className="border">
							<CardHeader className="border-b">
								<CardTitle className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-wider">
									<Palette className="size-3.5" />
									Palette
								</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-4 gap-2 pt-0">
								{palette.map(color => (
									<Button
										key={color}
										type="button"
										variant={paintColor === color ? 'secondary' : 'outline'}
										size="sm"
										className={cn('w-full', paintColor === color ? 'ring-2 ring-foreground' : '')}
										onClick={() => setPaintColor(color)}
									>
										<span className="h-4 w-4 border" style={{backgroundColor: color}} />
									</Button>
								))}
							</CardContent>
						</Card>

						<Card className="border">
							<CardHeader className="border-b">
								<CardTitle className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-wider">
									<Users className="size-3.5" />
									Players
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2 pt-0">
								{session.cursors.length === 0 ? (
									<div className="border p-2 font-mono text-muted-foreground text-xs">
										Connected players appear here.
									</div>
								) : (
									session.cursors.map(cursor => (
										<div key={cursor.id} className="flex items-center justify-between border p-2 font-mono text-xs">
											<div className="flex items-center gap-2">
												<span className="size-2 border" style={{backgroundColor: cursor.color}} />
												<span>{cursor.name}</span>
											</div>
											<span className="text-muted-foreground">
												{Math.floor(cursor.x)},{Math.floor(cursor.y)}
											</span>
										</div>
									))
								)}
							</CardContent>
						</Card>

						<Card className="border">
							<CardHeader className="border-b">
								<CardTitle className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-wider">
									<Crosshair className="size-3.5" />
									Session
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-1 pt-0 font-mono text-muted-foreground text-xs">
								<p>single shared room</p>
								<p>shared live state</p>
								<p>last update: {new Date(session.at).toLocaleTimeString()}</p>
							</CardContent>
						</Card>
					</aside>
				</section>
			</div>
		</div>
	)
}
