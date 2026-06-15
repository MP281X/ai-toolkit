import {useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Schema, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {activeWorktreeAtom} from '#lib/state.ts'
import {WorkbenchAgentTerminal, WorkbenchPendingAgentTerminal} from '#routes/components/-workbench-terminal.tsx'
import {AgentCommandProfileId} from '@deslop/ai/schema'

export const Route = createFileRoute('/(home)/$worktree/agent')({
	component: AgentPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Union([Schema.Struct({agentId: Schema.String}), Schema.Struct({profileId: AgentCommandProfileId})])
	)
})

function AgentPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeWorktree = useAtomSuspense(activeWorktreeAtom(params.worktree))
	const navigate = Route.useNavigate()

	if ('profileId' in search) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0">
				<WorkbenchPendingAgentTerminal
					cwd={activeWorktree.value.root}
					profileId={search.profileId}
					onCreated={session => {
						void navigate({
							params: {worktree: params.worktree},
							replace: true,
							search: {agentId: session.uuid},
							to: '/$worktree/agent'
						})
					}}
				/>
			</div>
		)
	}

	const session = pipe(
		activeWorktree.value.agents,
		Array.findFirst(candidate => candidate.uuid === search.agentId),
		Option.getOrThrowWith(() => new Error(`Unknown agent: ${search.agentId}`))
	)

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchAgentTerminal session={session} />
		</div>
	)
}
