import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, terminalViewAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

function TerminalPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeTerminal key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeTerminal(input: {readonly cwd: string}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const terminal = useAtomSuspense(terminalViewAtom({cwd: input.cwd}))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				data={terminal.value.data}
				frame={terminal.value.frame}
				onData={data => {
					write({payload: {cwd: input.cwd, data}})
				}}
				onResize={size => {
					resize({payload: {cols: size.cols, cwd: input.cwd, rows: size.rows}})
				}}
				state={terminal.value.state.state}
			/>
		</div>
	)
}
