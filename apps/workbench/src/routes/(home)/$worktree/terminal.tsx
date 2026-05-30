import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Duration, Effect, Stream, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalEvent} from '@deslop/terminal/schema'

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

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Terminal
				className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent"
				onData={data => void writeInput({payload: {...input, data}})}
				onResize={size => void resize({payload: {...input, ...size}})}
				write={writer => {
					for (const event of terminalEvents.value) {
						writer(event.data)
					}
				}}
			/>
		</div>
	)
}
