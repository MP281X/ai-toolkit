import {Array, Effect, Hash, Option, Order, Predicate, Record, Schema, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'

export type TerminalSessionInput = typeof TerminalSessionInput.Type
const TerminalSessionInput = Schema.Struct({
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
})

type TerminalSessionAtomKey = typeof TerminalSessionAtomKey.Type
export const TerminalSessionAtomKey = Schema.Struct({
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
})

type TerminalAttachAtomKey = typeof TerminalAttachAtomKey.Type
export const TerminalAttachAtomKey = Schema.Struct({
	attachId: Schema.Number,
	session: TerminalSessionInput,
	size: Schema.Struct({cols: Schema.Number, rows: Schema.Number})
})

function terminalSessionEnv(env: TerminalSessionInput['env']) {
	if (Predicate.isUndefined(env)) return

	return pipe(
		env,
		Record.toEntries,
		Array.sortWith(entry => entry[0], Order.String),
		Record.fromEntries
	)
}

export function terminalSessionInput(input: TerminalSessionInput) {
	const env = terminalSessionEnv(input.env)

	return {
		...(Predicate.isUndefined(input.args) ? {} : {args: [...input.args]}),
		...(Predicate.isUndefined(input.command) ? {} : {command: input.command}),
		cwd: input.cwd,
		...(Predicate.isUndefined(env) ? {} : {env}),
		...(Predicate.isUndefined(input.sessionId) ? {} : {sessionId: input.sessionId})
	}
}

export function terminalSessionKey(input: TerminalSessionInput) {
	return Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(terminalSessionInput(input))
}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

const terminalAttachQueueAtomFamily = Atom.family((input: TerminalAttachAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client =>
				client(
					'terminal.attach',
					{...terminalSessionInput(input.session), ...input.size},
					{asQueue: true, streamBufferSize: 64}
				)
			)
		)
	)
)

export const terminalFramePullAtomFamily = Atom.family((input: TerminalAttachAtomKey) =>
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

export const terminalStatusAtomFamily = Atom.family((input: TerminalSessionAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.status', terminalSessionInput(input))),
			Stream.unwrap
		),
		{initialValue: {state: 'idle', title: ''}}
	)
)

const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('projects', void 0)),
			Stream.unwrap
		)
	)
)

const homeSidebarAtom = Atom.keepAlive(
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
				Effect.map(sidebar => {
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

export const usageSubscriptionAtom = Atom.family((provider: 'claude' | 'codex') =>
	Atom.keepAlive(RpcClient.runtime.atom(Effect.flatMap(RpcClient, client => client('usage.subscription', {provider}))))
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
