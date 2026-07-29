import {Array, Match, Option, Predicate, Schema, String, pipe} from 'effect'

import {MonitorIcon, RotateCwIcon} from 'lucide-react'
import {useEffect, useRef, useState, type PointerEvent, type WheelEvent} from 'react'

import {cn} from '#lib/utils.ts'

type AgentBrowserFrame = typeof AgentBrowserFrame.Type
const AgentBrowserFrame = Schema.Struct({
	data: Schema.String,
	metadata: Schema.Struct({
		deviceHeight: Schema.Finite,
		deviceWidth: Schema.Finite,
		offsetTop: Schema.Finite,
		pageScaleFactor: Schema.Finite,
		scrollOffsetX: Schema.Finite,
		scrollOffsetY: Schema.Finite,
		timestamp: Schema.Finite
	}),
	type: Schema.Literal('frame')
})

type AgentBrowserStreamTab = typeof AgentBrowserStreamTab.Type
const AgentBrowserStreamTab = Schema.Struct({
	active: Schema.Boolean,
	label: Schema.OptionFromOptionalNullOr(Schema.String, {onNoneEncoding: 'omit'}),
	tabId: Schema.String,
	title: Schema.String,
	type: Schema.String,
	url: Schema.String
})

const AgentBrowserStreamMessageFromJson = Schema.fromJsonString(
	Schema.Union([
		AgentBrowserFrame,
		Schema.Struct({tabs: Schema.Array(AgentBrowserStreamTab), timestamp: Schema.Finite, type: Schema.Literal('tabs')})
	])
)

type AgentBrowserInput = typeof AgentBrowserInput.Type
const AgentBrowserInput = Schema.Union([
	Schema.Struct({
		button: Schema.optional(Schema.Literals(['left', 'none'])),
		clickCount: Schema.optional(Schema.Finite),
		deltaX: Schema.optional(Schema.Finite),
		deltaY: Schema.optional(Schema.Finite),
		eventType: Schema.Literals(['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel']),
		modifiers: Schema.optional(Schema.Finite),
		type: Schema.Literal('input_mouse'),
		x: Schema.Finite,
		y: Schema.Finite
	}),
	Schema.Struct({
		code: Schema.String,
		eventType: Schema.Literals(['keyDown', 'keyUp']),
		key: Schema.String,
		modifiers: Schema.optional(Schema.Finite),
		text: Schema.optional(Schema.String),
		type: Schema.Literal('input_keyboard'),
		windowsVirtualKeyCode: Schema.optional(Schema.Finite)
	})
])
const AgentBrowserInputFromJson = Schema.fromJsonString(AgentBrowserInput)

type AgentBrowserOwnedTab = {
	readonly id: string
	readonly label: string
	readonly streamLabel: string
	readonly url: string
}

const emptyTabs = Array.empty<AgentBrowserOwnedTab>()

export function agentBrowserStreamUrl(session: string) {
	const url = new URL(`/api/agent-browser/sessions/${encodeURIComponent(session)}/stream`, location.origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.toString()
}

function messageText(source: unknown) {
	if (source instanceof Blob) return source.text()
	if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return new TextDecoder().decode(source)
	return Predicate.isString(source) ? source : ''
}

async function decodeMessage(source: unknown) {
	const text = await Promise.resolve(messageText(source))
	return pipe(Schema.decodeUnknownOption(AgentBrowserStreamMessageFromJson)(text), Option.getOrUndefined)
}

function sendSocket(socket: WebSocket | null, input: AgentBrowserInput) {
	if (Predicate.isNull(socket) || socket.readyState !== WebSocket.OPEN) return
	socket.send(Schema.encodeSync(AgentBrowserInputFromJson)(input))
}

function modifiers(event: {
	readonly altKey: boolean
	readonly ctrlKey: boolean
	readonly metaKey: boolean
	readonly shiftKey: boolean
}) {
	return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)
}

function printableKey(event: KeyboardEvent) {
	return event.key.length === 1 && !event.ctrlKey && !event.metaKey ? event.key : undefined
}

export function agentBrowserCanvasPoint(input: {
	readonly clientX: number
	readonly clientY: number
	readonly rect: {readonly height: number; readonly left: number; readonly top: number; readonly width: number}
	readonly viewport: {readonly height: number; readonly width: number}
}) {
	const scale = Math.min(input.rect.width / input.viewport.width, input.rect.height / input.viewport.height)
	if (!Number.isFinite(scale) || scale <= 0) return

	const renderedWidth = input.viewport.width * scale
	const renderedHeight = input.viewport.height * scale
	const x =
		((input.clientX - input.rect.left - (input.rect.width - renderedWidth) / 2) / renderedWidth) * input.viewport.width
	const y =
		((input.clientY - input.rect.top - (input.rect.height - renderedHeight) / 2) / renderedHeight) *
		input.viewport.height
	if (x < 0 || x > input.viewport.width || y < 0 || y > input.viewport.height) return

	return {x: Math.round(x), y: Math.round(y)}
}

function pointerPoint(
	event: PointerEvent<HTMLCanvasElement> | WheelEvent<HTMLCanvasElement>,
	viewport: {readonly height: number; readonly width: number}
) {
	return agentBrowserCanvasPoint({
		clientX: event.clientX,
		clientY: event.clientY,
		rect: event.currentTarget.getBoundingClientRect(),
		viewport
	})
}

function mouseButton(eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel', buttons: number) {
	if (eventType !== 'mouseMoved') return 'left' as const
	return buttons === 1 ? ('left' as const) : ('none' as const)
}

function frameMessage(value: typeof AgentBrowserStreamMessageFromJson.Type | undefined) {
	return value?.type === 'frame' ? value : undefined
}

function tabsMessage(value: typeof AgentBrowserStreamMessageFromJson.Type | undefined) {
	return value?.type === 'tabs' ? value.tabs : undefined
}

export function agentBrowserActiveOwnedTabId(input: {
	readonly ownedTabs: readonly {
		readonly id: string
		readonly label: string
		readonly streamLabel: string
		readonly url: string
	}[]
	readonly streamTabs: readonly AgentBrowserStreamTab[]
}) {
	return pipe(
		input.streamTabs,
		Array.findFirst(tab => tab.active),
		Option.flatMap(tab => tab.label),
		Option.flatMap(label => Array.findFirst(input.ownedTabs, tab => tab.streamLabel === label)),
		Option.map(tab => tab.id),
		Option.getOrUndefined
	)
}

function frameViewport(frame: AgentBrowserFrame, bitmap: ImageBitmap) {
	return {height: frame.metadata.deviceHeight || bitmap.height, width: frame.metadata.deviceWidth || bitmap.width}
}

function decodeFrame(frame: AgentBrowserFrame) {
	const binary = atob(frame.data)
	const bytes = String.isEmpty(binary)
		? new Uint8Array()
		: new Uint8Array(
				pipe(
					Array.range(0, binary.length - 1),
					Array.map(index => binary.charCodeAt(index))
				)
			)
	return createImageBitmap(new Blob([bytes], {type: 'image/jpeg'}))
}

export function AgentBrowser(props: {
	readonly className?: string
	readonly onSelectTab?: (tab: {
		readonly id: string
		readonly label: string
		readonly streamLabel: string
		readonly url: string
	}) => void
	readonly session?: string
	readonly streamUrl?: string
	readonly tabs?: readonly {
		readonly id: string
		readonly label: string
		readonly streamLabel: string
		readonly url: string
	}[]
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const contextRef = useRef<CanvasRenderingContext2D | null>(null)
	const socketRef = useRef<WebSocket | null>(null)
	const tabsRef = useRef<readonly AgentBrowserOwnedTab[]>(props.tabs ?? [])
	const onSelectTabRef = useRef<typeof props.onSelectTab | null>(null)
	const viewportRef = useRef({height: 900, width: 1600})
	const canvasSizeRef = useRef({height: 0, width: 0})
	const latestFrameRef = useRef<{readonly frame: AgentBrowserFrame; readonly serial: number} | null>(null)
	const rafRef = useRef<number | null>(null)
	const drawingRef = useRef(false)
	const drawnSerialRef = useRef(0)
	const frameSerialRef = useRef(0)
	const hasFrameRef = useRef(false)
	const [activeTabId, setActiveTabId] = useState<string | undefined>()
	const [hasFrame, setHasFrame] = useState(false)
	const streamUrl =
		props.streamUrl ?? (Predicate.isNotUndefined(props.session) ? agentBrowserStreamUrl(props.session) : undefined)
	const tabs = props.tabs ?? emptyTabs

	useEffect(() => {
		tabsRef.current = tabs
	}, [tabs])

	useEffect(() => {
		onSelectTabRef.current = props.onSelectTab
	}, [props.onSelectTab])

	function requestDraw() {
		if (Predicate.isNotNull(rafRef.current) || drawingRef.current) return
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = null
			if (Predicate.isNotNull(latestFrameRef.current)) void drawFrame(latestFrameRef.current)
		})
	}

	async function drawFrame(queued: {readonly frame: AgentBrowserFrame; readonly serial: number}) {
		drawingRef.current = true
		try {
			const bitmap = await decodeFrame(queued.frame)
			if (Predicate.isNull(latestFrameRef.current) || latestFrameRef.current.serial !== queued.serial) {
				bitmap.close()
				return
			}

			if (Predicate.isNull(canvasRef.current)) {
				bitmap.close()
				return
			}

			const viewport = frameViewport(queued.frame, bitmap)
			viewportRef.current = viewport
			if (canvasSizeRef.current.width !== viewport.width || canvasSizeRef.current.height !== viewport.height) {
				canvasRef.current.width = viewport.width
				canvasRef.current.height = viewport.height
				canvasSizeRef.current = viewport
				contextRef.current = null
			}
			const context = contextRef.current ?? canvasRef.current.getContext('2d')
			contextRef.current = context
			context?.drawImage(bitmap, 0, 0, viewport.width, viewport.height)
			bitmap.close()
			drawnSerialRef.current = queued.serial
			if (!hasFrameRef.current) {
				hasFrameRef.current = true
				setHasFrame(true)
			}
		} finally {
			drawingRef.current = false
			if (Predicate.isNotNull(latestFrameRef.current) && latestFrameRef.current.serial > drawnSerialRef.current) {
				requestDraw()
			}
		}
	}

	function queueFrame(frame: AgentBrowserFrame) {
		const serial = frameSerialRef.current + 1
		frameSerialRef.current = serial
		latestFrameRef.current = {frame, serial}
		requestDraw()
	}

	useEffect(() => {
		queueMicrotask(() => {
			setHasFrame(false)
			setActiveTabId(undefined)
		})
		hasFrameRef.current = false
		latestFrameRef.current = null
		drawnSerialRef.current = 0
		frameSerialRef.current = 0
		if (Predicate.isNotNull(rafRef.current)) cancelAnimationFrame(rafRef.current)
		rafRef.current = null
		if (Predicate.isNull(canvasRef.current)) return
		contextRef.current?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
	}, [streamUrl])

	useEffect(() => {
		if (Predicate.isUndefined(streamUrl)) return

		const abort = new AbortController()

		function connect() {
			if (abort.signal.aborted || Predicate.isUndefined(streamUrl)) return

			const socket = new WebSocket(streamUrl)
			socketRef.current = socket
			socket.addEventListener('close', () => {
				if (abort.signal.aborted || socketRef.current !== socket) return
				setTimeout(connect, 750)
			})
			async function handleMessage(data: unknown) {
				const message = await decodeMessage(data)
				if (abort.signal.aborted || socketRef.current !== socket) return

				const frame = frameMessage(message)
				if (Predicate.isNotUndefined(frame)) queueFrame(frame)

				const streamTabs = tabsMessage(message)
				if (Predicate.isNotUndefined(streamTabs)) {
					const nextActive = agentBrowserActiveOwnedTabId({ownedTabs: tabsRef.current, streamTabs})
					setActiveTabId(current => (current === nextActive ? current : nextActive))
				}
			}
			socket.addEventListener('message', event => {
				void handleMessage(event.data)
			})
		}

		connect()

		return () => {
			abort.abort()
			socketRef.current?.close()
			socketRef.current = null
		}
	}, [streamUrl])

	useEffect(
		() => () => {
			if (Predicate.isNotNull(rafRef.current)) cancelAnimationFrame(rafRef.current)
		},
		[]
	)

	function pointer(event: PointerEvent<HTMLCanvasElement>, eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased') {
		const point = pointerPoint(event, viewportRef.current)
		if (Predicate.isUndefined(point)) return
		sendSocket(socketRef.current, {
			button: mouseButton(eventType, event.buttons),
			clickCount: eventType === 'mousePressed' || eventType === 'mouseReleased' ? 1 : 0,
			eventType,
			modifiers: modifiers(event),
			type: 'input_mouse',
			...point
		})
	}

	useEffect(() => {
		function handleKeyboard(event: KeyboardEvent) {
			if (document.activeElement !== canvasRef.current) return
			event.preventDefault()
			event.stopPropagation()
			const eventType = event.type === 'keydown' ? 'keyDown' : 'keyUp'
			const text =
				eventType === 'keyDown'
					? pipe(
							Match.value(event.key),
							Match.when('Backspace', () => '\b'),
							Match.when('Enter', () => '\r'),
							Match.when('Tab', () => '\t'),
							Match.orElse(() => printableKey(event))
						)
					: undefined
			const windowsVirtualKeyCode = pipe(
				Match.value(event.key),
				Match.when('ArrowDown', () => 40),
				Match.when('ArrowLeft', () => 37),
				Match.when('ArrowRight', () => 39),
				Match.when('ArrowUp', () => 38),
				Match.when('Backspace', () => 8),
				Match.when('Delete', () => 46),
				Match.when('End', () => 35),
				Match.when('Enter', () => 13),
				Match.when('Escape', () => 27),
				Match.when('Home', () => 36),
				Match.when('PageDown', () => 34),
				Match.when('PageUp', () => 33),
				Match.when('Tab', () => 9),
				Match.orElse(() => event.keyCode)
			)
			sendSocket(socketRef.current, {
				code: event.code,
				eventType,
				key: event.key,
				modifiers: modifiers(event),
				text,
				type: 'input_keyboard',
				windowsVirtualKeyCode
			})
		}

		window.addEventListener('keydown', handleKeyboard, true)
		window.addEventListener('keyup', handleKeyboard, true)
		return () => {
			window.removeEventListener('keydown', handleKeyboard, true)
			window.removeEventListener('keyup', handleKeyboard, true)
		}
	}, [])

	if (Predicate.isUndefined(streamUrl)) {
		return (
			<div className={cn('bg-background flex h-full min-h-0 min-w-0 items-center justify-center', props.className)}>
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<MonitorIcon className="size-4" />
					No browser session.
				</div>
			</div>
		)
	}

	return (
		<div className={cn('bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden', props.className)}>
			<div className="bg-background flex h-8 shrink-0 items-center border-b px-2">
				<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{tabs.length === 0 ? (
						<span className="text-muted-foreground text-xs">{props.session ?? 'agent-browser'}</span>
					) : (
						Array.map(tabs, tab => (
							<button
								key={tab.id}
								type="button"
								aria-current={activeTabId === tab.id ? 'page' : undefined}
								className={cn(
									'border-border h-6 w-fit shrink-0 border px-2 text-left text-xs whitespace-nowrap',
									activeTabId === tab.id
										? 'bg-primary/15 text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
								title={tab.url}
								onClick={() => {
									setActiveTabId(tab.id)
									onSelectTabRef.current?.(tab)
								}}
							>
								{tab.label}
							</button>
						))
					)}
				</div>
			</div>
			<div className="bg-background relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
				<canvas
					ref={canvasRef}
					tabIndex={0}
					className="focus:ring-ring block h-full w-full object-contain outline-none focus:ring-2"
					onPointerDown={event => {
						event.currentTarget.focus()
						event.currentTarget.setPointerCapture(event.pointerId)
						pointer(event, 'mousePressed')
					}}
					onPointerMove={event => {
						pointer(event, 'mouseMoved')
					}}
					onPointerUp={event => {
						pointer(event, 'mouseReleased')
						if (event.currentTarget.hasPointerCapture(event.pointerId)) {
							event.currentTarget.releasePointerCapture(event.pointerId)
						}
					}}
					onPointerCancel={event => {
						if (event.currentTarget.hasPointerCapture(event.pointerId)) {
							event.currentTarget.releasePointerCapture(event.pointerId)
						}
					}}
					onWheel={event => {
						event.preventDefault()
						const point = pointerPoint(event, viewportRef.current)
						if (Predicate.isUndefined(point)) return
						sendSocket(socketRef.current, {
							button: 'none',
							clickCount: 0,
							deltaX: event.deltaX,
							deltaY: event.deltaY,
							eventType: 'mouseWheel',
							modifiers: modifiers(event),
							type: 'input_mouse',
							...point
						})
					}}
				/>
				{!hasFrame && (
					<div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
						<RotateCwIcon className="size-4 animate-spin" />
					</div>
				)}
			</div>
		</div>
	)
}
