import {useAtomSuspense} from '@effect/atom-react'
import {Array, Option, pipe} from 'effect'

import {models} from '@ai-toolkit/ai/catalog'
import {createFileRoute} from '@tanstack/react-router'
import {startTransition} from 'react'

import {AgentPanel, agentsAtom, useHomeSelection} from './route.tsx'

export const Route = createFileRoute('/(home)/agent')({
	component: AgentRoute
})

function AgentRoute() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const agents = useAtomSuspense(agentsAtom).value
	const {activeProject, activeWorktree} = useHomeSelection(search)
	const selectedAgent = pipe(
		agents,
		Array.findFirst(agent => agent.agentId === search.agentId),
		Option.getOrUndefined
	)
	if (!(activeProject && activeWorktree)) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">No project selected.</div>
		)
	}
	if (!search.agentId) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				Create an agent from a worktree action to start a conversation.
			</div>
		)
	}
	if (!selectedAgent) {
		return <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Agent not found.</div>
	}
	const availableModels = Array.filter(models, model => pipe(model.agents, Array.contains(selectedAgent.layer)))
	const selectedModel = pipe(
		availableModels,
		Array.findFirst(model => `${model.provider}:${model.model}` === search.agentModel),
		Option.getOrElse(() => availableModels[0])
	)
	if (!selectedModel) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">No model available.</div>
		)
	}

	return (
		<AgentPanel
			key={selectedAgent.agentId}
			agentId={selectedAgent.agentId}
			activeWorktree={activeWorktree}
			layer={selectedAgent.layer}
			model={selectedModel.model}
			provider={selectedModel.provider}
			setModel={agentModel =>
				startTransition(() => {
					navigate({search: current => ({...current, agentModel})})
				})
			}
		/>
	)
}
