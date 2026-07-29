import {useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Schema, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {activeHomeAtom, agentsAtom} from '#lib/state.ts'
import {WorkbenchTerminal} from '#routes/components/-workbench-terminal.tsx'

export const Route = createFileRoute('/(home)/$worktree/agent')({
	component: AgentPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({agentId: Schema.String}))
})

function AgentPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	const cwd = activeHome.value.activeWorktree?.root ?? ''
	const sessions = useAtomSuspense(agentsAtom(cwd))
	if (!activeHome.value.activeWorktree) return
	const session = pipe(
		sessions.value,
		Array.findFirst(candidate => candidate.uuid === search.agentId),
		Option.getOrUndefined
	)
	if (!session) return

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal
				key={search.agentId}
				session={{
					args: session.args,
					command: session.command,
					cwd: activeHome.value.activeWorktree.root,
					env: session.env,
					sessionId: search.agentId
				}}
			/>
		</div>
	)
}
