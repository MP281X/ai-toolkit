import {useAtomSet, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {Predicate} from 'effect'

import {useEffect, useRef, useState} from 'react'

import {terminalAttachmentOperations, terminalAttachmentSizeEqual} from './-terminal-attachment-model.ts'

import {RpcClient} from '#lib/atomRuntime.ts'
import {
	TerminalAttachAtomKey,
	TerminalSessionAtomKey,
	terminalFramePullAtomFamily,
	terminalSessionInput,
	terminalSessionKey,
	terminalStatusAtomFamily,
	type TerminalSessionInput
} from '#lib/state.ts'
import {Terminal, type TerminalHandle} from '@deslop/components/render/terminal'

export function WorkbenchTerminal(input: {session: TerminalSessionInput}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const sessionKey = terminalSessionKey(input.session)
	const status = useAtomSuspense(
		terminalStatusAtomFamily(TerminalSessionAtomKey.make(terminalSessionInput(input.session)))
	)
	const terminalRef = useRef<TerminalHandle>(null)
	const nextAttachIdRef = useRef(0)
	const sizeRef = useRef<{cols: number; rows: number} | null>(null)
	const reattachTimeoutRef = useRef<number | null>(null)
	const [attachment, setAttachment] = useState<{
		id: number
		sessionKey: string
		size: {cols: number; rows: number}
	} | null>(null)

	useEffect(
		() => () => {
			if (Predicate.isNotNull(reattachTimeoutRef.current)) window.clearTimeout(reattachTimeoutRef.current)
			reattachTimeoutRef.current = null
		},
		[sessionKey]
	)

	function nextAttachment(size: {cols: number; rows: number}) {
		nextAttachIdRef.current += 1
		return {id: nextAttachIdRef.current, size}
	}

	function reattach() {
		if (status.value.state === 'exited' || status.value.state === 'failed' || status.value.state === 'stopped') return
		if (Predicate.isNotNull(reattachTimeoutRef.current)) return

		reattachTimeoutRef.current = window.setTimeout(() => {
			reattachTimeoutRef.current = null
			if (status.value.state === 'exited' || status.value.state === 'failed' || status.value.state === 'stopped') return
			setAttachment(current => {
				const size = sizeRef.current ?? current?.size
				return Predicate.isUndefined(size) ? current : {...nextAttachment(size), sessionKey}
			})
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
					if (Predicate.isNotNull(sizeRef.current) && !terminalAttachmentSizeEqual(sizeRef.current, size)) reattach()
					sizeRef.current = size
					resize({payload: {...input.session, cols: size.cols, rows: size.rows}})
					setAttachment(current => {
						if (Predicate.isNull(current) || current.sessionKey !== sessionKey) {
							return {...nextAttachment(size), sessionKey}
						}
						return current
					})
				}}
				state={status.value.state}
			/>
			{Predicate.isNotNull(attachment) && attachment.sessionKey === sessionKey && (
				<TerminalAttachment
					key={`${sessionKey}:${attachment.id}`}
					attachId={attachment.id}
					currentSize={() => sizeRef.current}
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
	attachId: number
	currentSize: () => {cols: number; rows: number} | null
	onDone: () => void
	session: TerminalSessionInput
	size: {cols: number; rows: number}
	terminalRef: React.RefObject<TerminalHandle | null>
}) {
	const framePull = terminalFramePullAtomFamily(
		TerminalAttachAtomKey.make({
			attachId: input.attachId,
			session: terminalSessionInput(input.session),
			size: input.size
		})
	)
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
			const latestSize = input.currentSize()
			if (Predicate.isNotNull(latestSize) && !terminalAttachmentSizeEqual(input.size, latestSize)) {
				activeRef.current = false
				input.onDone()
				return
			}
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

			const next = terminalAttachmentOperations({frames: result.value.items, lastSequence: lastSequenceRef.current})
			if (next.operations.length === 0) {
				pullFrames(void 0)
				return
			}

			writingRef.current = true
			function process(index: number): void {
				if (!activeRef.current) return
				const appliedSize = input.currentSize()
				if (Predicate.isNotNull(appliedSize) && !terminalAttachmentSizeEqual(input.size, appliedSize)) {
					activeRef.current = false
					writingRef.current = false
					input.onDone()
					return
				}
				const operation = next.operations[index]
				if (Predicate.isUndefined(operation)) {
					lastSequenceRef.current = next.lastSequence
					writingRef.current = false
					pullFrames(void 0)
					return
				}
				if (Predicate.isNull(input.terminalRef.current)) {
					activeRef.current = false
					writingRef.current = false
					input.onDone()
					return
				}
				if (operation.type === 'reset') {
					try {
						input.terminalRef.current.reset()
					} catch {
						activeRef.current = false
						writingRef.current = false
						input.onDone()
						return
					}
					process(index + 1)
					return
				}
				try {
					input.terminalRef.current.write(operation.data, () => {
						process(index + 1)
					})
				} catch {
					activeRef.current = false
					writingRef.current = false
					input.onDone()
				}
			}
			process(0)
		},
		{immediate: true}
	)

	return null
}
