import {Array, Data, Effect, Hash, Option, Order, Result, Stream, String, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {TerminalStatus} from '@deslop/terminal/schema'

export type TerminalSessionInput = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly env?: Readonly<Record<string, string>>
	readonly sessionId?: string
}

class TerminalSessionAtomKey extends Data.Class<TerminalSessionInput> {}

function terminalSessionInput(input: TerminalSessionInput): TerminalSessionInput {
	return {
		...(input.args === undefined ? {} : {args: [...input.args]}),
		...(input.command === undefined ? {} : {command: input.command}),
		cwd: input.cwd,
		...(input.env === undefined ? {} : {env: {...input.env}}),
		...(input.sessionId === undefined ? {} : {sessionId: input.sessionId})
	}
}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

export function terminalSessionStatus(input: TerminalSessionInput): TerminalStatus {
	return {state: input.command === undefined && input.sessionId === undefined ? 'starting' : 'idle', title: ''}
}

const terminalAttachQueueAtomFamily = Atom.family((input: TerminalSessionAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('terminal.attach', terminalSessionInput(input), {asQueue: true}))
		)
	)
)

export function terminalAttachQueueAtom(input: TerminalSessionInput) {
	return terminalAttachQueueAtomFamily(new TerminalSessionAtomKey(terminalSessionInput(input)))
}

const terminalStatusAtomFamily = Atom.family((input: TerminalSessionAtomKey) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.status.watch', terminalSessionInput(input))),
			Stream.unwrap
		),
		{initialValue: terminalSessionStatus(input)}
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

export const portlessOriginsAtom = Atom.family((cwd: string) =>
	Atom.make(get =>
		pipe(
			get.result(portlessRunsAtom(cwd)),
			Effect.map(scripts =>
				pipe(
					scripts,
					Array.filterMap(script => (script.origin === undefined ? Result.failVoid : Result.succeed(script.origin))),
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
			Effect.map(client => client('projects.watch', void 0)),
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

export const agentsAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('agents.watch', {cwd})),
			Stream.unwrap
		)
	)
)
