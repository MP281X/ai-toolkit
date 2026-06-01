import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, terminalEventsAtom, terminalStateAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

function TerminalPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeTerminal key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeTerminal(input: {readonly cwd: string}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const terminalEvents = useAtomSuspense(terminalEventsAtom(input))
	const terminalState = useAtomSuspense(terminalStateAtom(input))

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
