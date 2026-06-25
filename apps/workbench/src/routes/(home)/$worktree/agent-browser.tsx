import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Predicate, Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {useEffect, useRef, useState, type PointerEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {agentBrowserSessionsAtom} from '#lib/state.ts'
import {
	decodeAgentBrowserStreamEventData,
	initialAgentBrowserStreamState,
	reduceAgentBrowserStreamMessage,
	type AgentBrowserStreamState
} from '#routes/components/-agent-browser-stream-model.ts'
import {cn} from '@deslop/components/utils'

export const Route = createFileRoute('/(home)/$worktree/agent-browser')({
	component: AgentBrowserPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({session: Schema.optional(Schema.String)}))
})

function streamUrl(session: string) {
	const url = new URL(`/api/agent-browser/sessions/${encodeURIComponent(session)}/stream`, location.origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.toString()
}

function AgentBrowserPage() {
	const search = Route.useSearch()
	const sessions = useAtomSuspense(agentBrowserSessionsAtom)
	const selected =
		Predicate.isNotUndefined(search.session) && Array.some(sessions.value, session => session.name === search.session)
			? search.session
			: sessions.value[0]?.name

	return (
		<div className="bg-background h-full min-h-0 min-w-0 border-t">
			<AgentBrowserCanvas key={selected ?? 'empty'} session={selected} />
		</div>
	)
}

const visualizerViewport = {height: 1080, width: 1920} as const

function AgentBrowserCanvas(input: {readonly session?: string}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const socketRef = useRef<WebSocket | null>(null)
	const setViewport = useAtomSet(RpcClient.mutation('agentBrowser.viewport'), {mode: 'promise'})
	const [state, setState] = useState<{readonly connected: boolean; readonly stream: AgentBrowserStreamState}>(() => ({
		connected: false,
		stream: initialAgentBrowserStreamState()
	}))

	useEffect(() => {
		if (Predicate.isUndefined(input.session)) return

		async function applyViewport(session: string) {
			try {
				await setViewport({payload: {height: visualizerViewport.height, session, width: visualizerViewport.width}})
			} catch {}
		}
		void applyViewport(input.session)

		const socket = new WebSocket(streamUrl(input.session))
		socketRef.current = socket
		async function handleMessage(data: unknown) {
			const message = await decodeAgentBrowserStreamEventData(data)
			setState(current => ({...current, stream: reduceAgentBrowserStreamMessage(current.stream, message)}))
		}
		socket.addEventListener('open', () => {
			setState(current => ({...current, connected: true}))
		})
		socket.addEventListener('close', () => {
			setState(current => ({...current, connected: false}))
		})
		socket.addEventListener('message', event => {
			void handleMessage(event.data)
		})

		return () => {
			socket.close()
			socketRef.current = null
		}
	}, [input.session, setViewport])

	useEffect(() => {
		if (Predicate.isUndefined(state.stream.frame) || Predicate.isNull(canvasRef.current)) return

		const image = new Image()
		image.onload = () => {
			if (Predicate.isNull(canvasRef.current) || Predicate.isUndefined(state.stream.frame)) return
			const width = state.stream.frame.metadata?.deviceWidth ?? image.naturalWidth
			const height = state.stream.frame.metadata?.deviceHeight ?? image.naturalHeight
			canvasRef.current.width = width
			canvasRef.current.height = height
			canvasRef.current.getContext('2d')?.drawImage(image, 0, 0, width, height)
		}
		image.src = `data:image/jpeg;base64,${state.stream.frame.data}`
	}, [state.stream.frame])

	function send(value: unknown) {
		if (Predicate.isNull(socketRef.current) || socketRef.current.readyState !== WebSocket.OPEN) return
		socketRef.current.send(Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(value))
	}

	function pointer(event: PointerEvent<HTMLCanvasElement>, eventType: string) {
		const rect = event.currentTarget.getBoundingClientRect()
		const width = state.stream.frame?.metadata?.deviceWidth ?? event.currentTarget.width
		const height = state.stream.frame?.metadata?.deviceHeight ?? event.currentTarget.height
		send({
			button: 'left',
			clickCount: 1,
			eventType,
			type: 'input_mouse',
			x: Math.round(((event.clientX - rect.left) / rect.width) * width),
			y: Math.round(((event.clientY - rect.top) / rect.height) * height)
		})
	}

	if (Predicate.isUndefined(input.session)) {
		return (
			<div className="text-muted-foreground flex h-full items-center justify-center text-sm">No session selected.</div>
		)
	}

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-3 border-b px-2 text-xs">
				<span className={cn('font-mono', state.connected ? 'text-chart-1' : 'text-muted-foreground')}>
					{state.connected ? 'connected' : 'disconnected'}
				</span>
				<span className="min-w-0 truncate font-mono">{input.session}</span>
			</div>
			<div className="bg-muted/30 flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
				<canvas
					ref={canvasRef}
					tabIndex={0}
					className="bg-background focus:ring-ring block h-auto max-h-full w-auto max-w-full outline-none focus:ring-2"
					onPointerDown={event => {
						event.currentTarget.focus()
						pointer(event, 'mousePressed')
					}}
					onPointerUp={event => {
						pointer(event, 'mouseReleased')
					}}
					onPointerMove={event => {
						if (event.buttons === 1) pointer(event, 'mouseMoved')
					}}
					onKeyDown={event => {
						send({code: event.code, eventType: 'keyDown', key: event.key, type: 'input_keyboard'})
					}}
					onKeyUp={event => {
						send({code: event.code, eventType: 'keyUp', key: event.key, type: 'input_keyboard'})
					}}
				/>
			</div>
		</div>
	)
}
