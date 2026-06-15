import {Array, Effect, Option, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {SidebarProject, SidebarWorktree, TerminalPayload} from '#rpcs/contracts.ts'
import {TerminalStatus} from '@deslop/terminal/schema'
import type {TerminalSize} from '@deslop/terminal/schema'

export function terminalFramePullAtom(input: {readonly session: TerminalPayload; readonly size: TerminalSize}) {
	const terminalAttachQueueAtom = RpcClient.runtime.atom(
		Effect.flatMap(RpcClient, client =>
			client('terminal.attach', {session: input.session, size: input.size}, {asQueue: true})
		)
	)

	return Atom.pull(
		get =>
			pipe(get.result(terminalAttachQueueAtom, {suspendOnWaiting: true}), Effect.map(Stream.fromQueue), Stream.unwrap),
		{disableAccumulation: true}
	)
}

export const terminalStatusAtom = Atom.family((input: TerminalPayload) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.status', input)),
			Stream.unwrap
		),
		{initialValue: new TerminalStatus({state: 'idle', title: ''})}
	)
)

export const homeSidebarAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('home.sidebar', void 0)),
			Stream.unwrap
		)
	)
)

export const activeSidebarAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.map(get.result(homeSidebarAtom), sidebar => {
				const active = Array.reduce(
					sidebar.projects,
					Option.none<readonly [SidebarProject, SidebarWorktree]>(),
					(current, project) =>
						Option.isSome(current)
							? current
							: pipe(
									project.worktrees,
									Array.findFirst(worktree => worktree.id === worktreeId),
									Option.map(worktree => [project, worktree] as const)
								)
				)

				return {
					activeProject: Option.getOrUndefined(Option.map(active, value => value[0])),
					activeWorktree: Option.getOrUndefined(Option.map(active, value => value[1])),
					agentProfiles: sidebar.agentProfiles,
					projects: sidebar.projects
				}
			})
		)
	)
)

export const activeWorktreeAtom = Atom.family((worktreeId: string) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.map(get.result(activeSidebarAtom(worktreeId)), sidebar => {
				if (sidebar.activeWorktree === undefined) throw new Error(`Unknown worktree: ${worktreeId}`)
				return sidebar.activeWorktree
			})
		)
	)
)

export const usageAtom = Atom.family((provider: 'claude' | 'codex') =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('usage', {provider})),
				Stream.unwrap
			)
		)
	)
)

export const systemUsageAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('usage.system', void 0)),
			Stream.unwrap
		)
	)
)
