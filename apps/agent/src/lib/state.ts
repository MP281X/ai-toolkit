import {Array, Effect, Hash, Option, pipe, Record, Stream} from 'effect'

import type {AgentKey} from '@ai-toolkit/ai/schema'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'

export const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('projects.watch', void 0)),
			Stream.unwrap
		)
	)
)

export const agentsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('agents.watch', void 0)),
			Stream.unwrap
		)
	)
)

export const draftAgentsAtom = Atom.keepAlive(Atom.make(Record.empty<string, AgentKey>()))

export const activeHomeAtom = Atom.family((worktreeId: string | undefined) => {
	return Atom.keepAlive(
		Atom.make(get => {
			return Effect.gen(function* () {
				const projects = yield* get.result(projectsAtom)
				const activeProject = pipe(
					projects,
					Array.findFirst(project => {
						return Array.some(
							project.worktrees,
							worktree => Math.abs(Hash.string(worktree.root)).toString(36) === worktreeId
						)
					}),
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
		})
	)
})

export const selectedAgentAtom = Atom.family((threadId: string) => {
	return Atom.keepAlive(
		Atom.make(get => {
			return Effect.gen(function* () {
				const agents = yield* get.result(agentsAtom)
				const draftAgents = get(draftAgentsAtom)

				if (Record.has(draftAgents, threadId)) return draftAgents[threadId]

				return pipe(
					agents,
					Array.findFirst(agent => agent.id === threadId),
					Option.getOrUndefined
				)
			})
		})
	)
})
