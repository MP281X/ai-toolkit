import {Array, Duration, Effect, Hash, Option, Order, Result, Stream, String, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {TerminalState, TerminalUpdate} from '@deslop/terminal/schema'

export type TerminalSessionInput = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly env?: Readonly<Record<string, string>>
	readonly sessionId?: string
}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

function terminalStateInitialValue(input: TerminalSessionInput): TerminalState {
	return {
		runId: 0,
		state: input.command === undefined && input.sessionId === undefined ? 'starting' : 'idle',
		title: ''
	}
}

function terminalViewInitialValue(input: TerminalSessionInput) {
	return {data: '', frame: 0, state: terminalStateInitialValue(input)}
}

function terminalViewUpdates(current: ReturnType<typeof terminalViewInitialValue>, updates: Iterable<TerminalUpdate>) {
	const nextView = pipe(
		updates,
		Array.reduce({data: '', frame: current.frame, state: current.state}, (currentView, update) => {
			const next = currentView
			if (update.type === 'state') {
				next.state = update.state
				return next
			}

			next.data += update.data
			return next
		})
	)

	return {data: nextView.data, frame: nextView.data === '' ? nextView.frame : nextView.frame + 1, state: nextView.state}
}

export const terminalViewAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.watch', input, {streamBufferSize: 256})),
			Stream.unwrap,
			Stream.groupedWithin(100, Duration.millis(16)),
			Stream.scan(terminalViewInitialValue(input), terminalViewUpdates)
		),
		{initialValue: terminalViewInitialValue(input)}
	)
)

export const terminalStateAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.state.watch', input)),
			Stream.unwrap
		),
		{initialValue: terminalStateInitialValue(input)}
	)
)

export const portlessRunsAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.flatMap(client => (String.isNonEmpty(cwd) ? client('runs.portless', {cwd}) : Effect.succeed([])))
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
