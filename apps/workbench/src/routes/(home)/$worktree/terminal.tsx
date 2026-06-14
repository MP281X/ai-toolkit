import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute} from '@tanstack/react-router'

import {activeHomeAtom} from '#lib/state.ts'
import {WorkbenchTerminal} from '#routes/components/-workbench-terminal.tsx'
import {TerminalPayload} from '#rpcs/contracts.ts'

export const Route = createFileRoute('/(home)/$worktree/terminal')({component: TerminalPage})

function TerminalPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	return (
		<div key={activeHome.value.activeWorktree.root} className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal session={TerminalPayload.make({cwd: activeHome.value.activeWorktree.root})} />
		</div>
	)
}
