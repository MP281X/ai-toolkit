import {useAtom, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {Array, Hash, Option, Order, pipe} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'
import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {TerminalAttachmentInput, terminalFramePullAtom, terminalStatusAtom} from '#lib/state.ts'
import type {TerminalPayload} from '#rpcs/contracts.ts'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalHandle} from '@deslop/components/render/terminal'
import type {TerminalFrame} from '@deslop/terminal/schema'

export function WorkbenchTerminal(input: {readonly session: TerminalPayload}) {
	const [, resize] = useAtom(RpcClient.mutation('terminal.resize'))
	const [, write] = useAtom(RpcClient.mutation('terminal.write'))
	const sessionKey = `${Hash.hash(input.session)}`
	const status = useAtomSuspense(terminalStatusAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const attachRef = useRef<{readonly id: number; readonly size: {readonly cols: number; readonly rows: number}} | null>(
		{id: 0, size: {cols: 120, rows: 32}}
	)
	const nextAttachmentRef = useRef(0)
	const sessionKeyRef = useRef(sessionKey)
	const [attachment, setAttachment] = useState<{
		readonly id: number
		readonly size: {readonly cols: number; readonly rows: number}
	} | null>({id: 0, size: {cols: 120, rows: 32}})

	if (sessionKeyRef.current !== sessionKey) {
		sessionKeyRef.current = sessionKey
		attachRef.current = null
	}

	useEffect(() => {
		terminalRef.current?.reset()
		attachRef.current = {id: 0, size: {cols: 120, rows: 32}}
		nextAttachmentRef.current = 0
		setAttachment({id: 0, size: {cols: 120, rows: 32}})
	}, [sessionKey])

	return (
		<>
			<Terminal
				ref={terminalRef}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onData={data => {
					write({payload: {...input.session, data: {data, type: 'text'}}})
				}}
				onResize={size => {
					resize({payload: {...input.session, cols: size.cols, rows: size.rows}})
					if (attachRef.current === null) {
						nextAttachmentRef.current += 1
						attachRef.current = {id: nextAttachmentRef.current, size}
						setAttachment({id: nextAttachmentRef.current, size})
					} else {
						attachRef.current = {...attachRef.current, size}
					}
				}}
				state={status.value.state}
			/>
			{attachment !== null && (
				<TerminalAttachment
					key={`${sessionKey}:${attachment.id}`}
					attachId={attachment.id}
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
	readonly session: TerminalPayload
	readonly size: {readonly cols: number; readonly rows: number}
	readonly terminalRef: React.RefObject<TerminalHandle | null>
}) {
	const framePull = terminalFramePullAtom(
		new TerminalAttachmentInput({attachId: input.attachId, session: input.session, size: input.size})
	)
	const [, pullFrames] = useAtom(framePull)
	const activeRef = useRef(true)
	const lastSequenceRef = useRef(-1)
	const pendingFramesRef = useRef<readonly TerminalFrame[]>([])
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
	const writingRef = useRef(false)

	useEffect(() => {
		activeRef.current = true
		lastSequenceRef.current = -1
		pendingFramesRef.current = []
		writingRef.current = false
		pullFrames(void 0)

		return () => {
			activeRef.current = false
			if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
			retryTimeoutRef.current = null
		}
	}, [framePull, pullFrames])

	function drainFrames() {
		if (!activeRef.current || writingRef.current) return
		if (input.terminalRef.current === null) {
			retryTimeoutRef.current ??= setTimeout(() => {
				retryTimeoutRef.current = null
				drainFrames()
			}, 16)
			return
		}

		const frames = pipe(
			pendingFramesRef.current,
			Array.filter(frame => frame.sequence > lastSequenceRef.current),
			Array.sortWith(frame => frame.sequence, Order.Number)
		)
		pendingFramesRef.current = []
		if (frames.length === 0) {
			pullFrames(void 0)
			return
		}

		const operations = Array.reduce(
			frames,
			Array.empty<{readonly type: 'reset'} | {readonly data: string; readonly type: 'output'}>(),
			(currentOperations, frame) => {
				lastSequenceRef.current = frame.sequence
				if (frame.type === 'reset') {
					return Array.append(currentOperations, {type: 'reset'} as const)
				}

				const previous = Array.last(currentOperations)
				return Option.isSome(previous) && previous.value.type === 'output'
					? Array.append(Array.dropRight(currentOperations, 1), {
							data: `${previous.value.data}${frame.data}`,
							type: 'output'
						} as const)
					: Array.append(currentOperations, {data: frame.data, type: 'output'} as const)
			}
		)

		writingRef.current = true
		function process(index: number) {
			if (!activeRef.current) return
			Option.match(Array.get(operations, index), {
				onNone: () => {
					writingRef.current = false
					if (pendingFramesRef.current.length === 0) {
						pullFrames(void 0)
					} else {
						drainFrames()
					}
				},
				onSome: operation => {
					if (operation.type === 'reset') {
						input.terminalRef.current?.reset()
						process(index + 1)
						return
					}

					input.terminalRef.current?.write(operation.data, () => {
						process(index + 1)
					})
				}
			})
		}
		process(0)
	}

	useAtomSubscribe(
		framePull,
		result => {
			if (!activeRef.current) return
			if (AsyncResult.isFailure(result)) return
			if (!AsyncResult.isSuccess(result) || result.waiting) return
			if (result.value.done) return

			pendingFramesRef.current = Array.appendAll(pendingFramesRef.current, result.value.items)
			drainFrames()
		},
		{immediate: true}
	)

	return null
}
