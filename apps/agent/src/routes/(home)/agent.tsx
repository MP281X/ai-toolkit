import {Array, Option, pipe} from 'effect'

import {models} from '@ai-toolkit/ai/catalog'
import {createFileRoute} from '@tanstack/react-router'
import {startTransition} from 'react'

import {AgentPanel, agentId, defaultModel, useHomeSelection} from './route.tsx'

export const Route = createFileRoute('/(home)/agent')({
	component: AgentRoute
})

function AgentRoute() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const {activeProject, activeWorktree} = useHomeSelection(search)
	const selectedModel = pipe(
		models,
		Array.findFirst(model => model.model === search.agentModel),
		Option.getOrElse(() => defaultModel)
	)

	if (!(activeProject && activeWorktree)) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">No project selected.</div>
		)
	}

	return (
		<AgentPanel
			key={agentId(activeProject.repository.root, activeWorktree.root)}
			agentId={agentId(activeProject.repository.root, activeWorktree.root)}
			activeWorktree={activeWorktree}
			model={selectedModel.model}
			provider={selectedModel.provider}
			setModel={model =>
				startTransition(() => {
					navigate({search: current => ({...current, agentModel: model})})
				})
			}
		/>
	)
}
