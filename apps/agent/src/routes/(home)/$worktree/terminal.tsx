import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Duration, Effect, pipe, Stream} from 'effect'

import {Terminal} from '@ai-toolkit/components/render/terminal'
import type {TerminalEvent} from '@ai-toolkit/terminal/schema'
import {createFileRoute, Navigate} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'

export const Route = createFileRoute('/(home)/$worktree/terminal')({
	component: TerminalPage
})

const terminalEventsAtom = Atom.family((cwd: string) => {
	return RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => {
				return client('terminal.events', {cwd})
			}),
			Stream.unwrap,
			Stream.groupedWithin(100, Duration.millis(16))
		),
		{initialValue: Array.empty<TerminalEvent>()}
	)
})

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
		<div className="h-full min-h-0 min-w-0 bg-background p-2">
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
