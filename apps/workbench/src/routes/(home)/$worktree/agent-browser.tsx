import {Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {AgentBrowserRouteSearch, WorktreeAgentBrowser} from '#routes/components/-worktree-agent-browser.tsx'

export const Route = createFileRoute('/(home)/$worktree/agent-browser')({
	component: AgentBrowserPage,
	validateSearch: Schema.toStandardSchemaV1(AgentBrowserRouteSearch)
})

function AgentBrowserPage() {
	const params = Route.useParams()
	const search = Route.useSearch()

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorktreeAgentBrowser worktree={params.worktree} origin={search.origin} />
		</div>
	)
}
