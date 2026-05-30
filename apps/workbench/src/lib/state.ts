import {Array, Effect, Hash, Option, Stream, pipe} from 'effect'

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

export const activeHomeAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.gen(function* () {
				const projects = yield* get.result(projectsAtom)
				const activeProject = pipe(
					projects,
					Array.findFirst(project =>
						Array.some(project.worktrees, worktree => Math.abs(Hash.string(worktree.root)).toString(36) === worktreeId)
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
