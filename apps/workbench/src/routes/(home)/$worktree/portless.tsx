import {Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {AgentBrowserRouteSearch, WorktreeAgentBrowser} from '#routes/components/-worktree-agent-browser.tsx'

export const Route = createFileRoute('/(home)/$worktree/portless')({
	component: PortlessPage,
	validateSearch: Schema.toStandardSchemaV1(AgentBrowserRouteSearch)
})

function PortlessPage() {
	const params = Route.useParams()
	const search = Route.useSearch()

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<WorktreeAgentBrowser worktree={params.worktree} origin={search.origin} />
		</div>
	)
}
