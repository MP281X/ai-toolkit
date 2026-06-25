import {Array, Match, Option, Predicate, pipe} from 'effect'

import {MonitorIcon, RotateCwIcon} from 'lucide-react'
import {useEffect, useReducer, useRef, type KeyboardEvent, type PointerEvent, type WheelEvent} from 'react'

import {Button} from '#components/ui/button.tsx'
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

type AgentBrowserStatus = {readonly connected?: boolean; readonly engine?: string; readonly type: 'status'}

type State = {
	readonly connected: boolean
	readonly frame?: AgentBrowserFrame
	readonly status?: AgentBrowserStatus
	readonly tabs: readonly AgentBrowserTab[]
	readonly userCursor?: {readonly x: number; readonly y: number}
}

export function agentBrowserStreamUrl(session: string) {
	const url = new URL(`/api/agent-browser/sessions/${encodeURIComponent(session)}/stream`, location.origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.toString()
}

function reduceState(
	state: State,
	action:
		| {readonly type: 'close'}
		| {readonly frame: AgentBrowserFrame; readonly type: 'frame'}
		| {readonly status: AgentBrowserStatus; readonly type: 'status'}
		| {readonly tabs: readonly AgentBrowserTab[]; readonly type: 'tabs'}
		| {readonly type: 'open'}
		| {readonly cursor: {readonly x: number; readonly y: number}; readonly type: 'userCursor'}
) {
	return pipe(
		Match.value(action),
		Match.when({type: 'open'}, () => ({...state, connected: true})),
		Match.when({type: 'close'}, () => ({...state, connected: false})),
		Match.when({type: 'userCursor'}, value => ({...state, userCursor: value.cursor})),
		Match.when({type: 'frame'}, value => ({...state, frame: value.frame})),
		Match.when({type: 'status'}, value => ({
			...state,
			connected: value.status.connected ?? state.connected,
			status: value.status
		})),
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

function tabTitle(tab: AgentBrowserTab) {
	return tab.title ?? tab.url ?? tab.label ?? tab.tabId
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

function statusMessage(value: unknown) {
	if (!Predicate.hasProperty(value, 'type') || value.type !== 'status') return
	return {
		...(Predicate.hasProperty(value, 'connected') && Predicate.isBoolean(value.connected)
			? {connected: value.connected}
			: {}),
		...(Predicate.hasProperty(value, 'engine') && Predicate.isString(value.engine) ? {engine: value.engine} : {}),
		type: 'status' as const
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
	const [state, dispatch] = useReducer(reduceState, {connected: false, tabs: []} satisfies State)
	const streamUrl =
		props.streamUrl ?? (Predicate.isNotUndefined(props.session) ? agentBrowserStreamUrl(props.session) : undefined)
	const activeTab = pipe(
		state.tabs,
		Array.findFirst(tab => tab.active === true),
		Option.getOrUndefined
	)

	useEffect(() => {
		if (Predicate.isUndefined(streamUrl)) return

		const socket = new WebSocket(streamUrl)
		socketRef.current = socket
		socket.addEventListener('open', () => {
			dispatch({type: 'open'})
		})
		socket.addEventListener('close', () => {
			dispatch({type: 'close'})
		})
		async function handleMessage(data: unknown) {
			const message = await decodeMessage(data)
			const frame = frameMessage(message)
			if (Predicate.isNotUndefined(frame)) dispatch({frame, type: 'frame'})

			const status = statusMessage(message)
			if (Predicate.isNotUndefined(status)) dispatch({status, type: 'status'})

			const tabs = tabsMessage(message)
			if (Predicate.isNotUndefined(tabs)) dispatch({tabs, type: 'tabs'})
		}
		socket.addEventListener('message', event => {
			void handleMessage(event.data)
		})

		return () => {
			socket.close()
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

	function send(
		input:
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
	) {
		if (Predicate.isNull(socketRef.current) || socketRef.current.readyState !== WebSocket.OPEN) return
		// oxlint-disable-next-line @deslop/oxlint-rules/no-json-global -- agent-browser stream protocol JSON
		socketRef.current.send(JSON.stringify(input))
	}

	function pointer(event: PointerEvent<HTMLCanvasElement>, eventType: 'mouseMoved' | 'mousePressed' | 'mouseReleased') {
		const point = scalePoint(event, state.frame)
		dispatch({cursor: point, type: 'userCursor'})
		send({
			button: mouseButton(eventType, event.buttons),
			clickCount: eventType === 'mousePressed' || eventType === 'mouseReleased' ? 1 : 0,
			eventType,
			modifiers: modifiers(event),
			type: 'input_mouse',
			...point
		})
	}

	function keyboard(event: KeyboardEvent<HTMLCanvasElement>, eventType: 'keyDown' | 'keyUp') {
		send({
			code: event.code,
			eventType,
			key: event.key,
			modifiers: modifiers(event),
			text: eventType === 'keyDown' ? printableKey(event) : undefined,
			type: 'input_keyboard',
			windowsVirtualKeyCode: event.keyCode
		})
	}

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
			<div className="bg-muted/30 flex h-9 shrink-0 items-center gap-1 border-b px-1">
				<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{state.tabs.length === 0 ? (
						<span className="text-muted-foreground px-2 font-mono text-xs">{props.session ?? 'agent-browser'}</span>
					) : (
						Array.map(state.tabs, tab => (
							<Button
								key={tab.tabId}
								type="button"
								variant={tab.active === true ? 'secondary' : 'ghost'}
								size="sm"
								className="h-7 max-w-52 shrink-0 justify-start rounded-none px-2 font-mono text-xs"
								title={tabTitle(tab)}
								onClick={() => {
									props.onSelectTab?.(tab)
								}}
							>
								<span className="min-w-0 truncate">{tab.label ?? tab.tabId}</span>
							</Button>
						))
					)}
				</div>
				<div className="text-muted-foreground flex shrink-0 items-center gap-2 px-2 font-mono text-xs">
					<span className={state.connected ? 'text-chart-1' : undefined}>
						{state.connected ? 'connected' : 'offline'}
					</span>
					{Predicate.isNotUndefined(state.status?.engine) && <span>{state.status.engine}</span>}
					{Predicate.isNotUndefined(activeTab?.url) && (
						<span className="hidden max-w-80 truncate lg:block">{activeTab.url}</span>
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
					onKeyDown={event => {
						event.preventDefault()
						keyboard(event, 'keyDown')
					}}
					onKeyUp={event => {
						event.preventDefault()
						keyboard(event, 'keyUp')
					}}
				/>
				{Predicate.isUndefined(state.frame) && (
					<div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
						<RotateCwIcon className="size-4 animate-spin" />
						Waiting for browser stream.
					</div>
				)}
				{Predicate.isNotUndefined(state.userCursor) && Predicate.isNotUndefined(state.frame) && (
					<div
						className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-500 shadow"
						style={{
							left: `${(state.userCursor.x / (state.frame.metadata?.deviceWidth ?? 1)) * 100}%`,
							top: `${(state.userCursor.y / (state.frame.metadata?.deviceHeight ?? 1)) * 100}%`
						}}
					/>
				)}
			</div>
		</div>
	)
}
