import {useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Schema, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

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
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />
	const session = pipe(
		sessions.value,
		Array.findFirst(candidate => candidate.uuid === search.agentId),
		Option.getOrUndefined
	)
	if (!session) return <Navigate to="/" replace />

	return (
		<AgentTerminal
			args={session.args}
			command={session.command}
			cwd={activeHome.value.activeWorktree.root}
			sessionId={search.agentId}
		/>
	)
}

function AgentTerminal(input: {
	readonly args: readonly string[]
	readonly command: string
	readonly cwd: string
	readonly sessionId: string
}) {
	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				session={input}
			/>
		</div>
	)
}
