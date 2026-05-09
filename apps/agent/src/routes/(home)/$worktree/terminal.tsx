import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Duration, Effect, pipe, Stream} from 'effect'

import {Terminal} from '@ai-toolkit/components/render/terminal'
import {createFileRoute, Navigate} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import type {TerminalEvent} from '#rpcs/contracts.ts'

export const Route = createFileRoute('/(home)/$worktree/terminal')({
	component: TerminalPage
})

const terminalEventsAtom = Atom.family((key: string) => {
	return RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => {
				return client('terminal.events', {cwd: key.split('\u0000')[1] ?? '', id: key.split('\u0000')[0] ?? ''})
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

	const input = {cwd: activeHome.value.activeWorktree.root, id: params.worktree} as const

	return <WorktreeTerminal key={`${input.id}\u0000${input.cwd}`} {...input} />
}

function WorktreeTerminal(input: {readonly cwd: string; readonly id: string}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const terminalEvents = useAtomSuspense(terminalEventsAtom(`${input.id}\u0000${input.cwd}`))

	return (
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
	)
}
