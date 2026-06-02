import {Array, Duration, Effect, Hash, Option, Order, Result, Stream, String, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {TerminalEvent, TerminalState} from '@deslop/terminal/schema'
import {splitParallelCommands} from '@deslop/terminal/utils'

export type TerminalSessionInput = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly sessionId?: string
}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

function terminalStateInitialValue(input: TerminalSessionInput): TerminalState {
	return {ports: Array.empty<number>(), runId: 0, state: input.command === undefined ? 'starting' : 'idle', title: ''}
}

function terminalViewInitialValue(input: TerminalSessionInput) {
	return {events: Array.empty<TerminalEvent>(), state: terminalStateInitialValue(input)}
}

export const terminalViewAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.watch', input)),
			Stream.unwrap,
			Stream.groupedWithin(100, Duration.millis(16)),
			Stream.scan(terminalViewInitialValue(input), (current, updates) =>
				pipe(
					Array.fromIterable(updates),
					Array.reduce({...current, events: Array.empty<TerminalEvent>()}, (next, update) =>
						update.type === 'state' ? {...next, state: update.state} : {...next, events: [...next.events, update.event]}
					)
				)
			)
		),
		{initialValue: terminalViewInitialValue(input)}
	)
)

export const terminalStateAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.watch', input)),
			Stream.unwrap,
			Stream.filterMap(update => (update.type === 'state' ? Result.succeed(update.state) : Result.failVoid))
		),
		{initialValue: terminalStateInitialValue(input)}
	)
)

export const terminalPortsAtom = Atom.family((input: TerminalSessionInput) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.ports', input)),
			Stream.unwrap
		),
		{initialValue: Array.empty<number>()}
	)
)

export const runsAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd) ? client('runs.scripts', {cwd}) : Effect.succeed([])
			),
			{initialValue: []}
		)
	)
)

function runSessionId(scriptName: string, taskIndex: number) {
	return `run:${scriptName}:${taskIndex}`
}

export const browserPortsAtom = Atom.family((cwd: string) =>
	Atom.make(get =>
		pipe(
			Effect.all([
				get.result(terminalPortsAtom({cwd})),
				get.result(runsAtom(cwd)).pipe(
					Effect.flatMap(scripts =>
						Effect.all(
							pipe(
								scripts,
								Array.flatMap(script => {
									const tasks = splitParallelCommands(script.command)
									const parallel = tasks.length > 1

									return Array.map(tasks, (task, taskIndex) =>
										terminalPortsAtom({
											args: ['-lc', parallel ? task : `vp run ${script.name}`],
											command: 'sh',
											cwd,
											sessionId: runSessionId(script.name, taskIndex)
										})
									)
								}),
								Array.map(atom => get.result(atom))
							)
						)
					)
				)
			]),
			Effect.map(([terminalResult, scriptResults]) =>
				pipe(
					[
						...terminalResult,
						...pipe(
							scriptResults,
							Array.flatMap(result => result)
						)
					],
					Array.dedupe,
					Array.sort(Order.Number)
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
					const activeProject = pipe(
						projects,
						Array.findFirst(project =>
							Array.some(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
						)
					)

					return {
						activeProject: Option.getOrUndefined(activeProject),
						activeWorktree: pipe(
							activeProject,
							Option.flatMap(project =>
								Array.findFirst(project.worktrees, worktree => worktreeRouteId(worktree.root) === worktreeId)
							),
							Option.getOrUndefined
						),
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
