import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Duration, Effect, Stream, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalEvent, TerminalState} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

const terminalEventsAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.events', {cwd})),
			Stream.unwrap,
			Stream.groupedWithin(100, Duration.millis(16))
		),
		{initialValue: Array.empty<TerminalEvent>()}
	)
)

const terminalStateAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.state', {cwd})),
			Stream.unwrap
		),
		{
			initialValue: {
				args: [],
				command: '',
				cwd,
				ports: [],
				runId: 0,
				size: {cols: 120, rows: 32},
				status: {state: 'starting'}
			} as TerminalState
		}
	)
)

function TerminalPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeTerminal key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeTerminal(input: {readonly cwd: string}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const terminalEvents = useAtomSuspense(terminalEventsAtom(input.cwd))
	const terminalState = useAtomSuspense(terminalStateAtom(input.cwd))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onData={data => void writeInput({payload: {cwd: input.cwd, data}})}
				onResize={size => void resize({payload: {cols: size.cols, cwd: input.cwd, rows: size.rows}})}
				status={terminalState.value.status}
				write={terminal => {
					for (const event of terminalEvents.value) {
						if (event.type === 'reset') terminal.reset()
						else void terminal.write(event.data)
					}
				}}
			/>
		</div>
	)
}
