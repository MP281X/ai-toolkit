import {useAtomSet, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {useEffect, useRef} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {terminalFramePullAtom, terminalSessionKey, terminalStatusAtom, type TerminalSessionInput} from '#lib/state.ts'
import {Terminal, type TerminalHandle} from '@deslop/components/render/terminal'
import type {TerminalFrame} from '@deslop/terminal/schema'

function terminalFrameKey(frame: TerminalFrame) {
	return `${frame.cursor.epoch}:${frame.cursor.sequence}`
}

let nextAttachId = 0

export function WorkbenchTerminal(input: {readonly session: TerminalSessionInput}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const sessionKey = terminalSessionKey(input.session)
	const attachRef = useRef<{readonly id: number; readonly sessionKey: string} | null>(null)
	if (attachRef.current?.sessionKey !== sessionKey) {
		nextAttachId += 1
		attachRef.current = {id: nextAttachId, sessionKey}
	}
	const framePull = terminalFramePullAtom(input.session, attachRef.current.id)
	const pullFrames = useAtomSet(framePull)
	const status = useAtomSuspense(terminalStatusAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const activeRef = useRef(true)
	const processedFrameRef = useRef<string | null>(null)
	const pendingFramesRef = useRef(new Set<string>())

	useEffect(() => {
		const pendingFrames = pendingFramesRef.current
		activeRef.current = true
		processedFrameRef.current = null
		pendingFrames.clear()

		return () => {
			activeRef.current = false
			pendingFrames.clear()
		}
	}, [sessionKey])

	useAtomSubscribe(
		framePull,
		result => {
			if (result._tag !== 'Success' || result.waiting) return

			function processFrames(frames: readonly TerminalFrame[], index: number): void {
				if (!activeRef.current) return
				const frame = frames[index]
				if (frame === undefined) {
					pullFrames(void 0)
					return
				}

				const frameKey = terminalFrameKey(frame)
				if (processedFrameRef.current === frameKey || pendingFramesRef.current.has(frameKey)) {
					processFrames(frames, index + 1)
					return
				}

				pendingFramesRef.current.add(frameKey)

				function completeFrame() {
					pendingFramesRef.current.delete(frameKey)
					processedFrameRef.current = frameKey
					processFrames(frames, index + 1)
				}

				if (frame.type === 'reset') {
					terminalRef.current?.reset()
					completeFrame()
					return
				}
				if (frame.type === 'resize' || !terminalRef.current) {
					completeFrame()
					return
				}

				terminalRef.current.write(frame.data, () => {
					completeFrame()
				})
			}

			processFrames(result.value.items, 0)
		},
		{immediate: true}
	)

	return (
		<Terminal
			ref={terminalRef}
			className="h-full min-h-0 w-full min-w-0 overflow-hidden"
			onData={data => {
				write({payload: {...input.session, data: {data, type: 'text'}}})
			}}
			onResize={size => {
				resize({payload: {...input.session, cols: size.cols, rows: size.rows}})
			}}
			state={status.value.state}
		/>
	)
}
