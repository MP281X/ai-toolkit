import {Array, Effect, Hash, Option, Order, Schema, Stream, String, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {TerminalPayload} from '#rpcs/contracts.ts'
import {TerminalStatus} from '@deslop/terminal/schema'

class TerminalAttachmentSize extends Schema.Class<TerminalAttachmentSize>('TerminalAttachmentSize')({
	cols: Schema.Number,
	rows: Schema.Number
}) {}

export class TerminalAttachmentInput extends Schema.Class<TerminalAttachmentInput>('TerminalAttachmentInput')({
	attachId: Schema.Number,
	session: TerminalPayload,
	size: TerminalAttachmentSize
}) {}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

const terminalAttachQueueAtomFamily = Atom.family((input: TerminalAttachmentInput) =>
	RpcClient.runtime.atom(
		Effect.flatMap(RpcClient, client => client('terminal.attach', {...input.session, ...input.size}, {asQueue: true}))
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

export const portlessRunsAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd) ? client('runs.portless', {cwd}) : Effect.succeed([])
			),
			{initialValue: []}
		)
	)
)

export const scriptRunsAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd) ? client('runs.scripts', {cwd}) : Effect.succeed([])
			),
			{initialValue: []}
		)
	)
)

export const portlessOriginsAtom = Atom.family((cwd: string) =>
	Atom.make(get =>
		Effect.map(get.result(portlessRunsAtom(cwd)), scripts =>
			pipe(
				scripts,
				Array.map(run => run.origin.origin),
				Array.dedupe,
				Array.sortWith(origin => origin, Order.String)
			)
		)
	)
)

export const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('projects', void 0)),
			Stream.unwrap
		)
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

export const activeHomeAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.map(get.result(projectsAtom), projects => {
				const activeProject = Array.findFirst(projects, project =>
					Array.some(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
				)
				const activeWorktree = Option.flatMap(activeProject, project =>
					Array.findFirst(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
				)

				return {
					activeProject: Option.getOrUndefined(activeProject),
					activeWorktree: Option.getOrUndefined(activeWorktree),
					projects
				}
			})
		)
	)
)

export const activeSidebarAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.map(get.result(homeSidebarAtom), sidebar => {
				const activeProject = Array.findFirst(sidebar.projects, project =>
					Array.some(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
				)
				const activeWorktree = Option.flatMap(activeProject, project =>
					Array.findFirst(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
				)

				return {
					activeProject: Option.getOrUndefined(activeProject),
					activeWorktree: Option.getOrUndefined(activeWorktree),
					agentProfiles: sidebar.agentProfiles,
					projects: sidebar.projects
				}
			})
		)
	)
)

export const agentsAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('agents', {cwd})),
			Stream.unwrap
		)
	)
)

export const agentProfilesAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		Effect.flatMap(RpcClient, client => client('agents.profiles', void 0)),
		{initialValue: []}
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
