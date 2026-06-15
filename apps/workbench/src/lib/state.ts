import {Array, Effect, Option, Schema, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {TerminalPayload} from '#rpcs/contracts.ts'
import type {SidebarProject, SidebarWorktree} from '#rpcs/contracts.ts'
import {TerminalSize, TerminalStatus} from '@deslop/terminal/schema'

export class TerminalAttachmentInput extends Schema.Class<TerminalAttachmentInput>('TerminalAttachmentInput')({
	session: TerminalPayload,
	size: TerminalSize
}) {}

const terminalAttachQueueAtomFamily = Atom.family((input: TerminalAttachmentInput) =>
	RpcClient.runtime.atom(
		Effect.flatMap(RpcClient, client =>
			client('terminal.attach', {session: input.session, size: input.size}, {asQueue: true})
		)
	)
)

export const terminalFramePullAtom = Atom.family((input: TerminalAttachmentInput) =>
	Atom.pull(
		get =>
			pipe(
				get.result(terminalAttachQueueAtomFamily(input), {suspendOnWaiting: true}),
				Effect.map(Stream.fromQueue),
				Stream.unwrap
			),
		{disableAccumulation: true}
	)
)

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
