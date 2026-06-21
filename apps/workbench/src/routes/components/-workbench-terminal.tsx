import {useAtomSet, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {terminalFramePullAtom, terminalSessionKey, terminalStatusAtom, type TerminalSessionInput} from '#lib/state.ts'
import {Terminal, type TerminalHandle} from '@deslop/components/render/terminal'

let nextAttachId = 0

function nextAttachment(size: {readonly cols: number; readonly rows: number}) {
	nextAttachId += 1
	return {id: nextAttachId, size}
}

export function WorkbenchTerminal(input: {readonly session: TerminalSessionInput}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const sessionKey = terminalSessionKey(input.session)
	const status = useAtomSuspense(terminalStatusAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const sizeRef = useRef<{readonly cols: number; readonly rows: number} | null>(null)
	const reattachTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
	const [attachment, setAttachment] = useState<{
		readonly id: number
		readonly sessionKey: string
		readonly size: {readonly cols: number; readonly rows: number}
	} | null>(null)

	useEffect(
		() => () => {
			if (reattachTimeoutRef.current) clearTimeout(reattachTimeoutRef.current)
			reattachTimeoutRef.current = null
		},
		[sessionKey]
	)

	function reattach() {
		if (status.value.state === 'exited' || status.value.state === 'failed' || status.value.state === 'stopped') return
		if (reattachTimeoutRef.current) return

		reattachTimeoutRef.current = setTimeout(() => {
			reattachTimeoutRef.current = null
			if (status.value.state === 'exited' || status.value.state === 'failed' || status.value.state === 'stopped') return
			setAttachment(current =>
				current?.sessionKey === sessionKey ? {...nextAttachment(sizeRef.current ?? current.size), sessionKey} : current
			)
		}, 300)
	}

	return (
		<>
			<Terminal
				key={sessionKey}
				ref={terminalRef}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onData={data => {
					write({payload: {...input.session, data: {data, type: 'text'}}})
				}}
				onResize={size => {
					sizeRef.current = size
					resize({payload: {...input.session, cols: size.cols, rows: size.rows}})
					setAttachment(current =>
						current?.sessionKey === sessionKey ? current : {...nextAttachment(size), sessionKey}
					)
				}}
				state={status.value.state}
			/>
			{attachment !== null && attachment.sessionKey === sessionKey && (
				<TerminalAttachment
					key={`${sessionKey}:${attachment.id}`}
					attachId={attachment.id}
					onDone={reattach}
					session={input.session}
					size={attachment.size}
					terminalRef={terminalRef}
				/>
			)}
		</>
	)
}

function TerminalAttachment(input: {
	readonly attachId: number
	readonly onDone: () => void
	readonly session: TerminalSessionInput
	readonly size: {readonly cols: number; readonly rows: number}
	readonly terminalRef: React.RefObject<TerminalHandle | null>
}) {
	const framePull = terminalFramePullAtom(input.session, input.attachId, input.size)
	const pullFrames = useAtomSet(framePull)
	const activeRef = useRef(true)
	const lastSequenceRef = useRef(-1)
	const writingRef = useRef(false)

	useEffect(() => {
		activeRef.current = true
		lastSequenceRef.current = -1
		writingRef.current = false
		pullFrames(void 0)

		return () => {
			activeRef.current = false
		}
	}, [framePull, pullFrames])

	useAtomSubscribe(
		framePull,
		result => {
			if (!activeRef.current) return
			if (result._tag === 'Failure') {
				activeRef.current = false
				input.onDone()
				return
			}
			if (result._tag !== 'Success' || result.waiting || writingRef.current) return
			if (result.value.done) {
				activeRef.current = false
				input.onDone()
				return
			}

			const frames = result.value.items
				.filter(frame => frame.sequence > lastSequenceRef.current)
				.toSorted((left, right) => left.sequence - right.sequence)
			if (frames.length === 0) {
				pullFrames(void 0)
				return
			}

			const operations: ({readonly type: 'reset'} | {readonly data: string; readonly type: 'output'})[] = []
			for (const frame of frames) {
				lastSequenceRef.current = frame.sequence
				if (frame.type === 'reset') {
					operations.push({type: 'reset'})
					continue
				}

				const previous = operations[operations.length - 1]
				if (previous?.type === 'output') {
					operations[operations.length - 1] = {data: `${previous.data}${frame.data}`, type: 'output'}
				} else {
					operations.push({data: frame.data, type: 'output'})
				}
			}

			writingRef.current = true
			function process(index: number): void {
				if (!activeRef.current) return
				const operation = operations[index]
				if (operation === undefined) {
					writingRef.current = false
					pullFrames(void 0)
					return
				}
				if (operation.type === 'reset') {
					input.terminalRef.current?.reset()
					process(index + 1)
					return
				}
				input.terminalRef.current?.write(operation.data, () => {
					process(index + 1)
				})
			}
			process(0)
		},
		{immediate: true}
	)

	return null
}
