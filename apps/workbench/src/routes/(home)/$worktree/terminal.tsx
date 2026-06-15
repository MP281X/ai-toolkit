import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute} from '@tanstack/react-router'

import {activeWorktreeAtom} from '#lib/state.ts'
import {WorkbenchShellTerminal} from '#routes/components/-workbench-terminal.tsx'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

function TerminalPage() {
	const params = Route.useParams()
	const activeWorktree = useAtomSuspense(activeWorktreeAtom(params.worktree))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchShellTerminal cwd={activeWorktree.value.root} />
		</div>
	)
}
