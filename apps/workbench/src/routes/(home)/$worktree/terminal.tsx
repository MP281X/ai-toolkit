import {useAtomSuspense} from '@effect/atom-react'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {activeHomeAtom} from '#lib/state.ts'
import {WorkbenchTerminal} from '#routes/components/-workbench-terminal.tsx'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

function TerminalPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeTerminal key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeTerminal(input: {readonly cwd: string}) {
	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal className="h-full min-h-0 w-full min-w-0 overflow-hidden" session={{cwd: input.cwd}} />
		</div>
	)
}
