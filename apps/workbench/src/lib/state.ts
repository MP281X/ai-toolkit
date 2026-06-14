import {Array, Data, Effect, Hash, Option, Order, Stream, String, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {HomeSidebar} from '#rpcs/contracts.ts'
import type {TerminalStatus} from '@deslop/terminal/schema'

export type TerminalSessionInput = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly env?: Readonly<Record<string, string>>
	readonly sessionId?: string
}

class TerminalSessionAtomKey extends Data.Class<TerminalSessionInput> {}
class TerminalAttachAtomKey extends Data.Class<{
	readonly attachId: number
	readonly session: TerminalSessionInput
	readonly size: {readonly cols: number; readonly rows: number}
}> {}

function terminalSessionEnv(env: TerminalSessionInput['env']) {
	if (env === undefined) return

	return Object.fromEntries(
		pipe(
			Object.entries(env),
			Array.sortWith(entry => entry[0], Order.String)
		)
	)
}

function terminalSessionInput(input: TerminalSessionInput): TerminalSessionInput {
	const env = terminalSessionEnv(input.env)

	return {
		...(input.args === undefined ? {} : {args: [...input.args]}),
		...(input.command === undefined ? {} : {command: input.command}),
		cwd: input.cwd,
		...(env === undefined ? {} : {env}),
		...(input.sessionId === undefined ? {} : {sessionId: input.sessionId})
	}
}

export function terminalSessionKey(input: TerminalSessionInput) {
	return JSON.stringify(terminalSessionInput(input))
}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

function terminalSessionStatus(): TerminalStatus {
	return {state: 'idle', title: ''}
}

const terminalAttachQueueAtomFamily = Atom.family((input: TerminalAttachAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client =>
				client('terminal.attach', {...terminalSessionInput(input.session), ...input.size}, {asQueue: true})
			)
		)
	)
)

const terminalFramePullAtomFamily = Atom.family((input: TerminalAttachAtomKey) =>
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

export function terminalFramePullAtom(
	input: TerminalSessionInput,
	attachId: number,
	size: {readonly cols: number; readonly rows: number}
) {
	return terminalFramePullAtomFamily(new TerminalAttachAtomKey({attachId, session: terminalSessionInput(input), size}))
}

const terminalStatusAtomFamily = Atom.family((input: TerminalSessionAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.status', terminalSessionInput(input))),
			Stream.unwrap
		),
		{initialValue: terminalSessionStatus()}
	)
)

export function terminalStatusAtom(input: TerminalSessionInput) {
	return terminalStatusAtomFamily(new TerminalSessionAtomKey(terminalSessionInput(input)))
}

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
		pipe(
			get.result(portlessRunsAtom(cwd)),
			Effect.map(scripts =>
				pipe(
					scripts,
					Array.map(run => run.origin.origin),
					Array.dedupe,
					Array.sortWith(origin => origin, Order.String)
				)
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
			pipe(
				get.result(projectsAtom),
				Effect.map(projects => {
					const activeProject = Array.findFirst(projects, project =>
						Array.some(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
					)
					const activeWorktree = pipe(
						activeProject,
						Option.flatMap(project =>
							Array.findFirst(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
						)
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
)

export const activeSidebarAtom = Atom.family((worktreeId: string | undefined) =>
	Atom.keepAlive(
		Atom.make(get =>
			pipe(
				get.result(homeSidebarAtom),
				Effect.map((sidebar: HomeSidebar) => {
					const activeProject = Array.findFirst(sidebar.projects, project =>
						Array.some(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
					)
					const activeWorktree = pipe(
						activeProject,
						Option.flatMap(project =>
							Array.findFirst(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
						)
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
