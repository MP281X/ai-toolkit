import {Array, Match, Predicate, pipe} from 'effect'

import {MonitorIcon, RotateCwIcon} from 'lucide-react'
import {useEffect, useReducer, useRef, type PointerEvent, type WheelEvent} from 'react'

import {cn} from '#lib/utils.ts'

type AgentBrowserFrame = {
	readonly data: string
	readonly metadata?: {readonly deviceHeight?: number; readonly deviceWidth?: number}
	readonly type: 'frame'
}

type AgentBrowserTab = {
	readonly active?: boolean
	readonly label?: string
	readonly tabId: string
	readonly title?: string
	readonly url?: string
}

type AgentBrowserInput =
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

function emptyState() {
	return {
		frame: undefined as AgentBrowserFrame | undefined,
		tabs: Array.empty<AgentBrowserTab>() as readonly AgentBrowserTab[]
	}
}

export function agentBrowserStreamUrl(session: string) {
	const url = new URL(`/api/agent-browser/sessions/${encodeURIComponent(session)}/stream`, location.origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.toString()
}

function reduceState(
	state: ReturnType<typeof emptyState>,
	action:
		| {readonly frame: AgentBrowserFrame; readonly type: 'frame'}
		| {readonly tabs: readonly AgentBrowserTab[]; readonly type: 'tabs'}
		| {readonly type: 'reset'}
) {
	return pipe(
		Match.value(action),
		Match.when({type: 'reset'}, emptyState),
		Match.when({type: 'frame'}, value => ({...state, frame: value.frame})),
		Match.when({type: 'tabs'}, value => ({...state, tabs: value.tabs})),
		Match.exhaustive
	)
}

function messageText(source: unknown) {
	if (source instanceof Blob) return source.text()
	if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return new TextDecoder().decode(source)
	return Predicate.isString(source) ? source : ''
}

async function decodeMessage(source: unknown) {
	const text = await Promise.resolve(messageText(source))
	try {
		// oxlint-disable-next-line @deslop/oxlint-rules/no-json-global -- agent-browser stream protocol JSON
		return JSON.parse(text) as unknown
	} catch {
		return null
	}
}

function sendSocket(socket: WebSocket | null, input: AgentBrowserInput) {
	if (Predicate.isNull(socket) || socket.readyState !== WebSocket.OPEN) return
	// oxlint-disable-next-line @deslop/oxlint-rules/no-json-global -- agent-browser stream protocol JSON
	socket.send(JSON.stringify(input))
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

function tabValue(value: string | undefined) {
	return Predicate.isNotUndefined(value) && value !== '' ? value : undefined
}

function defaultTabLabel(tab: AgentBrowserTab) {
	return (
		tabValue(tab.label) ??
		tabValue(tab.title) ??
		(tab.url === 'about:blank' ? undefined : tabValue(tab.url)) ??
		'New tab'
	)
}

function defaultTabTitle(tab: AgentBrowserTab) {
	return tabValue(tab.title) ?? tabValue(tab.url) ?? tabValue(tab.label) ?? tab.tabId
}

function visibleTab(tab: AgentBrowserTab) {
	return (
		tab.url !== 'about:blank' ||
		Predicate.isNotUndefined(tabValue(tab.label)) ||
		Predicate.isNotUndefined(tabValue(tab.title))
	)
}

function scalePoint(
	event: PointerEvent<HTMLCanvasElement> | WheelEvent<HTMLCanvasElement>,
	frame: AgentBrowserFrame | undefined
) {
	const rect = event.currentTarget.getBoundingClientRect()
	const width = frame?.metadata?.deviceWidth ?? event.currentTarget.width
	const height = frame?.metadata?.deviceHeight ?? event.currentTarget.height
	return {
		x: Math.round(((event.clientX - rect.left) / rect.width) * width),
		y: Math.round(((event.clientY - rect.top) / rect.height) * height)
	}
}

function mouseButton(eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel', buttons: number) {
	if (eventType !== 'mouseMoved') return 'left' as const
	return buttons === 1 ? ('left' as const) : ('none' as const)
}

function frameMessage(value: unknown) {
	if (!Predicate.hasProperty(value, 'type') || value.type !== 'frame') return
	if (!Predicate.hasProperty(value, 'data') || !Predicate.isString(value.data)) return
	const metadata =
		Predicate.hasProperty(value, 'metadata') && Predicate.isObject(value.metadata) ? value.metadata : undefined
	return {
		data: value.data,
		...(Predicate.isUndefined(metadata)
			? {}
			: {
					metadata: {
						...(Predicate.hasProperty(metadata, 'deviceHeight') && Predicate.isNumber(metadata.deviceHeight)
							? {deviceHeight: metadata.deviceHeight}
							: {}),
						...(Predicate.hasProperty(metadata, 'deviceWidth') && Predicate.isNumber(metadata.deviceWidth)
							? {deviceWidth: metadata.deviceWidth}
							: {})
					}
				}),
		type: 'frame' as const
	}
}

function tabsMessage(value: unknown) {
	if (!Predicate.hasProperty(value, 'type') || value.type !== 'tabs') return
	if (!Predicate.hasProperty(value, 'tabs') || !Array.isArray(value.tabs)) return

	const tabs = Array.empty<AgentBrowserTab>()
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

export function AgentBrowser(props: {
	readonly className?: string
	readonly onSelectTab?: (tab: {readonly label?: string; readonly tabId: string}) => void
	readonly session?: string
	readonly streamUrl?: string
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const socketRef = useRef<WebSocket | null>(null)
	const [state, dispatch] = useReducer(reduceState, emptyState())
	const streamUrl =
		props.streamUrl ?? (Predicate.isNotUndefined(props.session) ? agentBrowserStreamUrl(props.session) : undefined)
	useEffect(() => {
		dispatch({type: 'reset'})
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
				if (Predicate.isNotUndefined(frame)) dispatch({frame, type: 'frame'})

				const tabs = tabsMessage(message)
				if (Predicate.isNotUndefined(tabs)) dispatch({tabs, type: 'tabs'})
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

	useEffect(() => {
		if (Predicate.isUndefined(state.frame) || Predicate.isNull(canvasRef.current)) return

		const image = new Image()
		image.onload = () => {
			if (Predicate.isNull(canvasRef.current) || Predicate.isUndefined(state.frame)) return
			const width = state.frame.metadata?.deviceWidth ?? image.naturalWidth
			const height = state.frame.metadata?.deviceHeight ?? image.naturalHeight
			canvasRef.current.width = width
			canvasRef.current.height = height
			canvasRef.current.getContext('2d')?.drawImage(image, 0, 0, width, height)
		}
		image.src = `data:image/jpeg;base64,${state.frame.data}`
	}, [state.frame])

	function send(input: AgentBrowserInput) {
		sendSocket(socketRef.current, input)
	}

	function pointer(event: PointerEvent<HTMLCanvasElement>, eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased') {
		const point = scalePoint(event, state.frame)
		send({
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

	const visibleTabs = pipe(state.tabs, Array.filter(visibleTab))

	if (Predicate.isUndefined(streamUrl)) {
		return (
			<div
				className={cn('bg-background flex h-full min-h-0 min-w-0 items-center justify-center border', props.className)}
			>
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<MonitorIcon className="size-4" />
					No browser session.
				</div>
			</div>
		)
	}

	return (
		<div className={cn('bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden border', props.className)}>
			<div className="bg-background flex h-9 shrink-0 items-center border-b px-2">
				<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{visibleTabs.length === 0 ? (
						<span className="text-muted-foreground text-xs">{props.session ?? 'agent-browser'}</span>
					) : (
						Array.map(visibleTabs, tab => (
							<button
								key={tab.tabId}
								type="button"
								aria-current={tab.active === true ? 'page' : undefined}
								className={cn(
									'border-border h-6 max-w-44 shrink-0 truncate border px-2 text-left text-xs',
									tab.active === true
										? 'bg-primary/15 text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
								title={defaultTabTitle(tab)}
								onClick={() => {
									props.onSelectTab?.(tab)
								}}
							>
								{defaultTabLabel(tab)}
							</button>
						))
					)}
				</div>
			</div>
			<div className="bg-muted/30 relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
				<canvas
					ref={canvasRef}
					tabIndex={0}
					className="bg-background focus:ring-ring block h-auto max-h-full w-auto max-w-full outline-none focus:ring-2"
					onPointerDown={event => {
						event.currentTarget.focus()
						pointer(event, 'mousePressed')
					}}
					onPointerMove={event => {
						pointer(event, 'mouseMoved')
					}}
					onPointerUp={event => {
						pointer(event, 'mouseReleased')
					}}
					onWheel={event => {
						event.preventDefault()
						const point = scalePoint(event, state.frame)
						send({
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
				{Predicate.isUndefined(state.frame) && (
					<div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
						<RotateCwIcon className="size-4 animate-spin" />
						Waiting for browser stream.
					</div>
				)}
			</div>
		</div>
	)
}
