import {useAtom, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {Equal} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'
import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {TerminalAttachmentInput, terminalFramePullAtom, terminalStatusAtom} from '#lib/state.ts'
import {
	TerminalCommandPayload,
	TerminalPackageScriptPayload,
	TerminalPortlessScriptPayload,
	TerminalShellPayload
} from '#rpcs/contracts.ts'
import type {AgentSession, SidebarPackageRun, SidebarPortlessRun, TerminalPayload} from '#rpcs/contracts.ts'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalHandle} from '@deslop/components/render/terminal'
import {TerminalSize} from '@deslop/terminal/schema'
import type {TerminalFrame} from '@deslop/terminal/schema'

export function WorkbenchShellTerminal(input: {readonly cwd: string}) {
	return <WorkbenchTerminal session={new TerminalShellPayload({cwd: input.cwd})} />
}

export function WorkbenchAgentTerminal(input: {readonly session: AgentSession}) {
	return (
		<WorkbenchTerminal
			session={
				new TerminalCommandPayload({
					args: input.session.args,
					command: input.session.command,
					cwd: input.session.cwd,
					env: input.session.env,
					sessionId: input.session.uuid
				})
			}
		/>
	)
}

export function WorkbenchPackageRunTerminal(input: {readonly run: SidebarPackageRun}) {
	return (
		<WorkbenchTerminal
			session={new TerminalPackageScriptPayload({cwd: input.run.cwd, sessionId: input.run.sessionId})}
		/>
	)
}

export function WorkbenchPortlessRunTerminal(input: {readonly run: SidebarPortlessRun}) {
	return (
		<WorkbenchTerminal
			session={new TerminalPortlessScriptPayload({cwd: input.run.cwd, sessionId: input.run.sessionId})}
		/>
	)
}

function WorkbenchTerminal(input: {readonly session: TerminalPayload}) {
	const [, resize] = useAtom(RpcClient.mutation('terminal.resize'))
	const [, write] = useAtom(RpcClient.mutation('terminal.write'))
	const status = useAtomSuspense(terminalStatusAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const latestSizeRef = useRef(new TerminalSize({cols: 120, rows: 32}))
	const sessionRef = useRef(input.session)
	const [attachmentSize, setAttachmentSize] = useState<TerminalSize | null>(null)

	useEffect(() => {
		if (Equal.equals(sessionRef.current, input.session)) return
		sessionRef.current = input.session
		terminalRef.current?.reset()
		latestSizeRef.current = new TerminalSize({cols: 120, rows: 32})
		setAttachmentSize(terminalRef.current === null ? null : latestSizeRef.current)
	}, [input.session])

	return (
		<>
			<Terminal
				ref={terminalRef}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onReady={() => {
					setAttachmentSize(latestSizeRef.current)
				}}
				onData={data => {
					write({payload: {data: {data, type: 'text'}, session: input.session}})
				}}
				onResize={size => {
					resize({payload: {session: input.session, size}})
					latestSizeRef.current = size
				}}
				state={status.value.state}
			/>
			{attachmentSize !== null && (
				<TerminalAttachment session={input.session} size={attachmentSize} terminalRef={terminalRef} />
			)}
		</>
	)
}

function TerminalAttachment(input: {
	readonly session: TerminalPayload
	readonly size: TerminalSize
	readonly terminalRef: React.RefObject<TerminalHandle | null>
}) {
	const framePull = terminalFramePullAtom(new TerminalAttachmentInput({session: input.session, size: input.size}))
	const [, pullFrames] = useAtom(framePull)
	const activeRef = useRef(true)
	const lastSequenceRef = useRef(-1)
	const pendingFramesRef = useRef<TerminalFrame[]>([])
	const writingRef = useRef(false)

	useEffect(() => {
		activeRef.current = true
		lastSequenceRef.current = -1
		pendingFramesRef.current = []
		writingRef.current = false
		pullFrames(void 0)

		return () => {
			activeRef.current = false
		}
	}, [framePull, pullFrames])

	function drainFrames() {
		if (!activeRef.current || writingRef.current) return
		if (input.terminalRef.current === null) return

		writingRef.current = true

		const frames = pendingFramesRef.current.splice(0)

		function finishBatch() {
			writingRef.current = false
			if (pendingFramesRef.current.length === 0) {
				pullFrames(void 0)
			} else {
				drainFrames()
			}
		}

		function writeOutput(data: string, done: () => void) {
			if (data === '') {
				done()
				return
			}
			input.terminalRef.current?.write(data, done)
		}

		function process(index: number, output: string) {
			if (!activeRef.current) return

			if (index >= frames.length) {
				writeOutput(output, () => {
					if (activeRef.current) finishBatch()
				})
				return
			}
			if (frames[index]!.sequence <= lastSequenceRef.current) {
				process(index + 1, output)
				return
			}

			lastSequenceRef.current = frames[index]!.sequence
			if (frames[index]!.type === 'output') {
				process(index + 1, `${output}${frames[index]!.data}`)
				return
			}

			writeOutput(output, () => {
				if (!activeRef.current) return
				input.terminalRef.current?.reset()
				process(index + 1, '')
			})
		}
		process(0, '')
	}

	useAtomSubscribe(
		framePull,
		result => {
			if (!activeRef.current) return
			if (AsyncResult.isFailure(result)) return
			if (!AsyncResult.isSuccess(result) || result.waiting) return
			if (result.value.done) return

			pendingFramesRef.current.push(...result.value.items)
			drainFrames()
		},
		{immediate: true}
	)

	return null
}
