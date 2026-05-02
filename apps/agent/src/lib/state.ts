import {Array, Effect, Hash, Option, pipe, Stream} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {AgentEntry} from '#rpcs/contracts.ts'

export const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('projects.watch', void 0)),
			Stream.unwrap
		)
	)
)

export const agentsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agents.watch', void 0)),
			Stream.unwrap
		)
	)
)

export const draftAgentsAtom = Atom.keepAlive(Atom.make<Readonly<Record<string, AgentEntry>>>({}))

export const activeHomeAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.gen(function* () {
				const projects = yield* get.result(projectsAtom)
				const activeProject = pipe(
					projects,
					Array.findFirst(project =>
						pipe(
							project.worktrees,
							Array.some(worktree => Math.abs(Hash.string(worktree.root)).toString(36) === worktreeId)
						)
					),
					Option.getOrUndefined
				)

				return {
					activeProject,
					activeWorktree: pipe(
						activeProject?.worktrees ?? [],
						Array.findFirst(worktree => Math.abs(Hash.string(worktree.root)).toString(36) === worktreeId),
						Option.getOrUndefined
					),
					projects
				}
			})
		)
	)
)

export const selectedAgentAtom = Atom.family((threadId: string) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.gen(function* () {
				const agents = yield* get.result(agentsAtom)
				const draftAgents = get(draftAgentsAtom)

				return (
					draftAgents[threadId] ??
					pipe(
						agents,
						Array.findFirst(agent => agent.agentId === threadId),
						Option.getOrUndefined
					)
				)
			})
		)
	)
)
