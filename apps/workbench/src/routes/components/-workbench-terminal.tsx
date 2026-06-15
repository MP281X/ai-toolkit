import {useAtom, useAtomSubscribe, useAtomSuspense} from '@effect/atom-react'

import {Array, Match} from 'effect'

import {AsyncResult} from 'effect/unstable/reactivity'
import {useEffect, useRef, useState} from 'react'
import type {RefObject} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {terminalFramePullAtom, terminalStatusAtom} from '#lib/state.ts'
import {
	TerminalCommandPayload,
	TerminalPackageScriptPayload,
	TerminalPortlessScriptPayload,
	TerminalShellPayload
} from '#rpcs/contracts.ts'
import type {AgentSession, SidebarPackageRun, SidebarPortlessRun, TerminalPayload} from '#rpcs/contracts.ts'
import type {AgentCommandProfileId} from '@deslop/ai/schema'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalHandle} from '@deslop/components/render/terminal'
import {toast} from '@deslop/components/ui/sonner'
import {formatError} from '@deslop/components/utils'
import {terminalChunks} from '@deslop/terminal/model'
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

export function WorkbenchPendingAgentTerminal(input: {
	readonly cwd: string
	readonly onCreated: (session: AgentSession) => void
	readonly profileId: AgentCommandProfileId
}) {
	const [, create] = useAtom(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const mountedRef = useRef(true)
	const startedRef = useRef(false)

	useEffect(
		() => () => {
			mountedRef.current = false
		},
		[]
	)

	return (
		<Terminal
			className="h-full min-h-0 w-full min-w-0 overflow-hidden"
			onData={() => {}}
			onReady={size => {
				if (startedRef.current) return

				startedRef.current = true
				void create({payload: {cwd: input.cwd, profileId: input.profileId, size}}).then(
					session => {
						if (mountedRef.current) input.onCreated(session)
					},
					error => {
						if (!mountedRef.current) return
						startedRef.current = false
						toast.error(formatError(error))
					}
				)
			}}
			state="starting"
		/>
	)
}

export function WorkbenchPendingRunsTerminal(input: {
	readonly onStarted: () => void
	readonly sessions: readonly TerminalPayload[]
}) {
	const [, restart] = useAtom(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const mountedRef = useRef(true)
	const startedRef = useRef(false)

	useEffect(
		() => () => {
			mountedRef.current = false
		},
		[]
	)

	return (
		<Terminal
			className="h-full min-h-0 w-full min-w-0 overflow-hidden"
			onData={() => {}}
			onReady={size => {
				if (startedRef.current) return

				startedRef.current = true
				void Promise.all(Array.map(input.sessions, session => restart({payload: {session, size}}))).then(
					() => {
						if (mountedRef.current) input.onStarted()
					},
					error => {
						if (!mountedRef.current) return
						startedRef.current = false
						toast.error(formatError(error))
					}
				)
			}}
			state="starting"
		/>
	)
}

function WorkbenchTerminal(input: {readonly session: TerminalPayload}) {
	const [, resize] = useAtom(RpcClient.mutation('terminal.resize'))
	const [, write] = useAtom(RpcClient.mutation('terminal.write'))
	const status = useAtomSuspense(terminalStatusAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const terminalKey = Match.value(input.session).pipe(
		Match.tag('shell', session => `shell:${session.cwd}`),
		Match.tag('command', session => `command:${session.cwd}:${session.sessionId}`),
		Match.tag('package-script', session => `package-script:${session.cwd}:${session.sessionId}`),
		Match.tag('portless-script', session => `portless-script:${session.cwd}:${session.sessionId}`),
		Match.exhaustive
	)
	const [attachment, setAttachment] = useState<{readonly key: string; readonly size: TerminalSize} | null>(null)

	return (
		<>
			<Terminal
				key={terminalKey}
				ref={terminalRef}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onReady={size => {
					setAttachment({key: terminalKey, size: new TerminalSize(size)})
				}}
				onData={data => {
					for (const chunk of terminalChunks(data, 16 * 1024)) {
						write({payload: {data: {data: chunk, type: 'text'}, session: input.session}})
					}
				}}
				onResize={size => {
					resize({payload: {session: input.session, size: new TerminalSize(size)}})
				}}
				state={status.value.state}
			/>
			{attachment !== null && attachment.key === terminalKey && (
				<TerminalAttachment
					key={`attachment:${attachment.key}`}
					session={input.session}
					size={attachment.size}
					terminalRef={terminalRef}
				/>
			)}
		</>
	)
}

function TerminalAttachment(input: {
	readonly session: TerminalPayload
	readonly size: TerminalSize
	readonly terminalRef: RefObject<TerminalHandle | null>
}) {
	const [framePull] = useState(() => terminalFramePullAtom({session: input.session, size: input.size}))
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
		const state = {chunks: Array.empty<string>(), index: 0}

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

		function flushOutput(done: () => void) {
			writeOutput(Array.join(state.chunks, ''), done)
			state.chunks.splice(0, state.chunks.length, '')
		}

		function processFrames() {
			if (!activeRef.current) return

			while (state.index < frames.length) {
				const frame = frames[state.index]!
				state.index += 1

				if (frame.type === 'reset' || frame.type === 'overflow') {
					flushOutput(() => {
						if (!activeRef.current) return

						input.terminalRef.current?.reset()
						lastSequenceRef.current = -1
						processFrames()
					})
					return
				}

				if (frame.sequence <= lastSequenceRef.current) continue

				lastSequenceRef.current = frame.sequence
				state.chunks.push(frame.data)
			}

			flushOutput(() => {
				if (activeRef.current) finishBatch()
			})
		}

		processFrames()
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
