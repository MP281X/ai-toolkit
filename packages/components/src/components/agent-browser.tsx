import {Array, Match, Option, Predicate, String, pipe} from 'effect'

import {MonitorIcon, RotateCwIcon} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import type {PointerEvent, WheelEvent} from 'react'

import {cn} from '#lib/utils.ts'
type AgentBrowserFrame = {
	readonly data: string
	readonly metadata?: {readonly deviceHeight?: number; readonly deviceWidth?: number}
	readonly type: 'frame'
}
type AgentBrowserOwnedTab = {
	readonly id: string
	readonly label: string
	readonly streamLabel: string
	readonly url: string
}
const emptyTabs = Array.empty<AgentBrowserOwnedTab>()
function resolvedTabs(tabs: readonly AgentBrowserOwnedTab[] | undefined) {
	return tabs ?? emptyTabs
}
function resolvedStreamUrl(input: {readonly session?: string; readonly streamUrl?: string}) {
	return input.streamUrl ?? (Predicate.isNotUndefined(input.session) ? agentBrowserStreamUrl(input.session) : undefined)
}
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
	try {
		return JSON.parse(text) as unknown
	} catch {
		return null
	}
}
function sendSocket(parameters: {
	readonly socket: WebSocket | null
	readonly input:
		| {
				readonly button?: 'left' | 'none'
				readonly clickCount?: number
				readonly deltaX?: number
				readonly deltaY?: number
				readonly eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel'
				readonly modifiers?: number
				readonly type: 'input_mouse'
				readonly x: number
				readonly y: number
		  }
		| {
				readonly code: string
				readonly eventType: 'keyDown' | 'keyUp'
				readonly key: string
				readonly modifiers?: number
				readonly text?: string
				readonly type: 'input_keyboard'
				readonly windowsVirtualKeyCode?: number
		  }
}) {
	if (Predicate.isNull(parameters.socket) || parameters.socket.readyState !== WebSocket.OPEN) return
	parameters.socket.send(JSON.stringify(parameters.input))
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
function pointerPoint(input: {
	readonly event: PointerEvent<HTMLCanvasElement> | WheelEvent<HTMLCanvasElement>
	readonly viewport: {readonly height: number; readonly width: number}
}) {
	return agentBrowserCanvasPoint({
		clientX: input.event.clientX,
		clientY: input.event.clientY,
		rect: input.event.currentTarget.getBoundingClientRect(),
		viewport: input.viewport
	})
}
function mouseButton(input: {
	readonly eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel'
	readonly buttons: number
}) {
	if (input.eventType !== 'mouseMoved') return 'left' as const
	return input.buttons === 1 ? ('left' as const) : ('none' as const)
}
function frameMessage(value: unknown) {
	if (!Predicate.hasProperty(value, 'type') || value.type !== 'frame') return
	if (!Predicate.hasProperty(value, 'data') || !Predicate.isString(value.data)) return
	return {
		data: value.data,
		...(Predicate.isUndefined(
			Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata) ? value.metadata : undefined
		)
			? {}
			: {
					metadata: {
						...(Predicate.hasProperty(
							Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
								? value.metadata
								: undefined,
							'deviceHeight'
						) &&
						Predicate.isNumber(
							(Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
								? value.metadata
								: undefined
							).deviceHeight
						)
							? {
									deviceHeight: (Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
										? value.metadata
										: undefined
									).deviceHeight
								}
							: {}),
						...(Predicate.hasProperty(
							Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
								? value.metadata
								: undefined,
							'deviceWidth'
						) &&
						Predicate.isNumber(
							(Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
								? value.metadata
								: undefined
							).deviceWidth
						)
							? {
									deviceWidth: (Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata)
										? value.metadata
										: undefined
									).deviceWidth
								}
							: {})
					}
				}),
		type: 'frame' as const
	}
}
function tabsMessage(value: unknown) {
	if (!Predicate.hasProperty(value, 'type') || value.type !== 'tabs') return
	if (!Predicate.hasProperty(value, 'tabs') || !Array.isArray(value.tabs)) return
	const tabs = Array.empty<{
		readonly active?: boolean
		readonly label?: string
		readonly tabId: string
		readonly title?: string
		readonly url?: string
	}>()
	for (const tab of value.tabs) {
		if (!Predicate.hasProperty(tab, 'tabId') || !Predicate.isString(tab.tabId)) continue
		tabs.push({
			...(Predicate.hasProperty(tab, 'active') && Predicate.isBoolean(tab.active) ? {active: tab.active} : {}),
			...(Predicate.hasProperty(tab, 'label') && Predicate.isString(tab.label) ? {label: tab.label} : {}),
			tabId: tab.tabId,
			...(Predicate.hasProperty(tab, 'title') && Predicate.isString(tab.title) ? {title: tab.title} : {}),
			...(Predicate.hasProperty(tab, 'url') && Predicate.isString(tab.url) ? {url: tab.url} : {})
		})
	}
	return tabs
}
export function agentBrowserActiveOwnedTabId(input: {
	readonly ownedTabs: readonly {
		readonly id: string
		readonly label: string
		readonly streamLabel: string
		readonly url: string
	}[]
	readonly streamTabs: readonly {
		readonly active?: boolean
		readonly label?: string
		readonly tabId: string
		readonly title?: string
		readonly url?: string
	}[]
}) {
	const active = Array.findFirst(input.streamTabs, tab => tab.active === true)
	if (Option.isNone(active) || Predicate.isUndefined(active.value.label)) return
	const owned = Array.findFirst(input.ownedTabs, tab => tab.streamLabel === active.value.label)
	return Option.isSome(owned) ? owned.value.id : undefined
}
function frameViewport(input: {readonly frame: AgentBrowserFrame; readonly bitmap: ImageBitmap}) {
	return {
		height: input.frame.metadata?.deviceHeight ?? input.bitmap.height,
		width: input.frame.metadata?.deviceWidth ?? input.bitmap.width
	}
}
function decodeFrame(frame: AgentBrowserFrame) {
	const binary = atob(frame.data)
	const bytes = pipe(
		Match.value(String.isEmpty(binary)),
		Match.when(true, () => new Uint8Array()),
		Match.orElse(
			() =>
				new Uint8Array(
					pipe(
						Array.range(0, binary.length - 1),
						Array.map(index => binary.charCodeAt(index))
					)
				)
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
	const tabs = resolvedTabs(props.tabs)
	const streamUrl = resolvedStreamUrl({session: props.session, streamUrl: props.streamUrl})
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
			viewportRef.current = frameViewport({bitmap, frame: queued.frame})
			if (
				canvasSizeRef.current.width !== frameViewport({bitmap, frame: queued.frame}).width ||
				canvasSizeRef.current.height !== frameViewport({bitmap, frame: queued.frame}).height
			) {
				canvasRef.current.width = frameViewport({bitmap, frame: queued.frame}).width
				canvasRef.current.height = frameViewport({bitmap, frame: queued.frame}).height
				canvasSizeRef.current = frameViewport({bitmap, frame: queued.frame})
				contextRef.current = null
			}
			contextRef.current ??= canvasRef.current.getContext('2d')
			contextRef.current?.drawImage(
				bitmap,
				0,
				0,
				frameViewport({bitmap, frame: queued.frame}).width,
				frameViewport({bitmap, frame: queued.frame}).height
			)
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
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined
		let socket = new WebSocket(streamUrl)
		function connect() {
			if (abort.signal.aborted) return
			const connectedSocket = socket
			socketRef.current = connectedSocket
			async function handleMessage(data: unknown) {
				const message = await decodeMessage(data)
				if (abort.signal.aborted || socketRef.current !== connectedSocket) return
				const frame = frameMessage(message)
				if (Predicate.isNotUndefined(frame)) queueFrame(frame)
				const streamTabs = tabsMessage(message)
				if (Predicate.isNotUndefined(streamTabs)) {
					const nextActive = agentBrowserActiveOwnedTabId({ownedTabs: tabsRef.current, streamTabs})
					setActiveTabId(current => (current === nextActive ? current : nextActive))
				}
			}
			function onMessage(event: MessageEvent) {
				void handleMessage(event.data)
			}
			function onClose() {
				connectedSocket.onclose = null
				connectedSocket.onmessage = null
				if (abort.signal.aborted || socketRef.current !== connectedSocket) return
				socketRef.current = null
				reconnectTimer = setTimeout(() => {
					reconnectTimer = undefined
					socket = new WebSocket(streamUrl)
					connect()
				}, 750)
			}
			connectedSocket.onclose = onClose
			connectedSocket.onmessage = onMessage
		}
		connect()
		return () => {
			abort.abort()
			if (Predicate.isNotUndefined(reconnectTimer)) clearTimeout(reconnectTimer)
			socket.onclose = null
			socket.onmessage = null
			socket.close()
			socketRef.current = null
		}
	}, [streamUrl])
	useEffect(
		() => () => {
			if (Predicate.isNotNull(rafRef.current)) cancelAnimationFrame(rafRef.current)
		},
		[]
	)
	function pointer(input: {
		readonly event: PointerEvent<HTMLCanvasElement>
		readonly eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased'
	}) {
		const point = pointerPoint({event: input.event, viewport: viewportRef.current})
		if (Predicate.isUndefined(point)) return
		sendSocket({
			input: {
				button: mouseButton({buttons: input.event.buttons, eventType: input.eventType}),
				clickCount: input.eventType === 'mousePressed' || input.eventType === 'mouseReleased' ? 1 : 0,
				eventType: input.eventType,
				modifiers: modifiers(input.event),
				type: 'input_mouse',
				...point
			},
			socket: socketRef.current
		})
	}
	useEffect(() => {
		function handleKeyboard(event: KeyboardEvent) {
			if (document.activeElement !== canvasRef.current) return
			event.preventDefault()
			event.stopPropagation()
			const eventType = event.type === 'keydown' ? 'keyDown' : 'keyUp'
			const text = pipe(
				Match.value(eventType),
				Match.when('keyDown', () =>
					pipe(
						Match.value(event.key),
						Match.when('Backspace', () => '\b'),
						Match.when('Enter', () => '\r'),
						Match.when('Tab', () => '\t'),
						Match.orElse(() => printableKey(event))
					)
				),
				Match.orElse(() => undefined)
			)
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
			sendSocket({
				input: {
					code: event.code,
					eventType,
					key: event.key,
					modifiers: modifiers(event),
					text,
					type: 'input_keyboard',
					windowsVirtualKeyCode
				},
				socket: socketRef.current
			})
		}
		window.addEventListener('keydown', handleKeyboard, true)
		window.addEventListener('keyup', handleKeyboard, true)
		return () => {
			window.removeEventListener('keydown', handleKeyboard, true)
			window.removeEventListener('keyup', handleKeyboard, true)
		}
	}, [])
	if (
		Predicate.isUndefined(
			props.streamUrl ?? (Predicate.isNotUndefined(props.session) ? agentBrowserStreamUrl(props.session) : undefined)
		)
	) {
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
					{(props.tabs ?? emptyTabs).length === 0 ? (
						<span className="text-muted-foreground text-xs">{props.session ?? 'agent-browser'}</span>
					) : (
						Array.map(props.tabs ?? emptyTabs, tab => (
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
						pointer({event, eventType: 'mousePressed'})
					}}
					onPointerMove={event => {
						pointer({event, eventType: 'mouseMoved'})
					}}
					onPointerUp={event => {
						pointer({event, eventType: 'mouseReleased'})
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
						const point = pointerPoint({event, viewport: viewportRef.current})
						if (Predicate.isUndefined(point)) return
						sendSocket({
							input: {
								button: 'none',
								clickCount: 0,
								deltaX: event.deltaX,
								deltaY: event.deltaY,
								eventType: 'mouseWheel',
								modifiers: modifiers(event),
								type: 'input_mouse',
								...point
							},
							socket: socketRef.current
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
