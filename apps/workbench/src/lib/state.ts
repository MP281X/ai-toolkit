import {Array, Duration, Effect, Hash, Option, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {TerminalEvent, TerminalState} from '@deslop/terminal/schema'

export type TerminalSessionInput = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly sessionId?: string
}

function terminalStateInitialValue(input: TerminalSessionInput): TerminalState {
	return {
		args: [...(input.args ?? [])],
		command: input.command ?? '',
		cwd: input.cwd,
		ports: [],
		runId: 0,
		size: {cols: 120, rows: 32},
		status: {state: 'starting'}
	}
}

export const terminalEventsAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.events', input)),
			Stream.unwrap,
			Stream.groupedWithin(100, Duration.millis(16))
		),
		{initialValue: Array.empty<TerminalEvent>()}
	)
)

export const terminalStateAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.state', input)),
			Stream.unwrap
		),
		{initialValue: terminalStateInitialValue(input)}
	)
)

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
