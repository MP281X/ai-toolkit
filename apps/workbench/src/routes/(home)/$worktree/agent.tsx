import {useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Predicate, Schema, pipe} from 'effect'

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
	const sessions = useAtomSuspense(agentsAtom(activeHome.value.activeWorktree?.root ?? ''))
	if (!activeHome.value.activeWorktree) return
	if (
		!pipe(
			sessions.value,
			Array.findFirst(candidate => candidate.uuid === search.agentId),
			Option.getOrUndefined
		)
	) {
		return
	}
	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal
				key={search.agentId}
				session={{
					args: pipe(
						sessions.value,
						Array.findFirst(candidate => candidate.uuid === search.agentId),
						Option.getOrUndefined
					).args,
					command: pipe(
						sessions.value,
						Array.findFirst(candidate => candidate.uuid === search.agentId),
						Option.getOrUndefined
					).command,
					cwd: activeHome.value.activeWorktree.root,
					...(Predicate.isUndefined(
						pipe(
							sessions.value,
							Array.findFirst(candidate => candidate.uuid === search.agentId),
							Option.getOrUndefined
						).env
					)
						? {}
						: {
								env: pipe(
									sessions.value,
									Array.findFirst(candidate => candidate.uuid === search.agentId),
									Option.getOrUndefined
								).env
							}),
					sessionId: search.agentId
				}}
			/>
		</div>
	)
}
