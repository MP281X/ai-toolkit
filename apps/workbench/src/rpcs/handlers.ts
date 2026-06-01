import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {Array, Context, Duration, Effect, Layer, RcMap, Result, Schema, Stream, SubscriptionRef, pipe} from 'effect'

import type {AgentSession} from '#rpcs/contracts.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {GitWorkspace, GitWorktree} from '@deslop/git/service'
import {TerminalError} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'
import {splitParallelCommands} from '@deslop/terminal/utils'

const TerminalSessionKey = Schema.Struct({
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	sessionId: Schema.optional(Schema.String)
})
type TerminalSessionKey = typeof TerminalSessionKey.Type

function terminalSession(input: TerminalSessionKey): TerminalSessionKey {
	return {
		...(input.args === undefined ? {} : {args: input.args}),
		...(input.command === undefined ? {} : {command: input.command}),
		cwd: input.cwd,
		...(input.sessionId === undefined ? {} : {sessionId: input.sessionId})
	}
}

function agentSessionId(uuid: string) {
	return `agent:${uuid}`
}

function agentSessionKey(input: {readonly cwd: string; readonly uuid: string}) {
	return JSON.stringify(input)
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: TerminalSessionKey) {
		const context = yield* Layer.buildWithScope(
			Terminal.layer({args: config.args, command: config.command, cwd: config.cwd}),
			yield* Effect.scope
		)

		return Context.get(context, Terminal)
	})
})

const GitWorktreeSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitWorktree.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitWorktree)
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* GitWorkspace
		const terminals = yield* TerminalSessions
		const gitWorktrees = yield* GitWorktreeSessions
		const agents = yield* SubscriptionRef.make<ReadonlyMap<string, AgentSession>>(new Map())

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const current = yield* SubscriptionRef.get(agents)
					const labelCount = pipe(
						Array.fromIterable(current.values()),
						Array.filter(session => session.cwd === payload.cwd),
						Array.filter(session => session.command === payload.command),
						Array.length
					)
					const session: AgentSession = {
						args: [...payload.args],
						command: payload.command,
						cwd: payload.cwd,
						icon: payload.icon,
						label: `${payload.label} ${labelCount + 1}`,
						uuid: randomUUID()
					}

					yield* SubscriptionRef.update(agents, sessions => {
						const next = new Map(sessions)
						next.set(agentSessionKey({cwd: session.cwd, uuid: session.uuid}), session)
						return next
					})
					const terminal = yield* RcMap.get(terminals, {
						args: session.args,
						command: session.command,
						cwd: session.cwd,
						sessionId: agentSessionId(session.uuid)
					})
					yield* terminal.restart()
					yield* pipe(
						pipe(
							terminal.updates,
							Stream.filterMap(update =>
								update.type === 'state' ? Result.succeed(update.state.state) : Result.failVoid
							),
							Stream.filter(state => state === 'exited' || state === 'failed' || state === 'stopped'),
							Stream.take(1),
							Stream.runDrain
						),
						Effect.andThen(
							SubscriptionRef.update(agents, current => {
								const next = new Map(current)
								next.delete(agentSessionKey({cwd: session.cwd, uuid: session.uuid}))
								return next
							})
						),
						Effect.forkScoped
					)

					return session
				}),
			'agents.remove': payload =>
				SubscriptionRef.update(agents, current => {
					const next = new Map(current)
					next.delete(agentSessionKey({cwd: payload.cwd, uuid: payload.uuid}))
					return next
				}),
			'agents.watch': payload =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(agents),
						Effect.map(current =>
							pipe(
								Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agents)))(Stream.make(current)),
								Stream.map(sessions =>
									pipe(
										Array.fromIterable(sessions.values()),
										Array.filter(session => session.cwd === payload.cwd)
									)
								)
							)
						)
					)
				),
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.createWorktree': payload => git.createWorktree(payload),
			'projects.deleteWorktree': payload => git.deleteWorktree(payload),
			'projects.watch': () =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(git.projects),
						Effect.map(projects =>
							Stream.concat(Stream.drop(1)(SubscriptionRef.changes(git.projects)))(Stream.make(projects))
						)
					)
				),
			'review.commitAndPush': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.commitAndPush({base: payload.base, message: payload.message}))
				),
			'review.createWipCommit': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.createWipCommit(payload.message))
				),
			'review.discardFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.discardFile(payload.filePath))
				),
			'review.metadata': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.metadata({base: payload.base}))
				),
			'review.stageFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.stageFile(payload.filePath))
				),
			'review.unstageFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.unstageFile(payload.filePath))
				),
			'review.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitWorktrees, payload.cwd),
						Effect.map(worktree => worktree.watchReviewDiffs(payload.scope))
					)
				),
			'review.watchRange': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitWorktrees, payload.cwd),
						Effect.map(worktree => worktree.watchReviewRangeDiffs({from: payload.from, to: payload.to}))
					)
				),
			'runs.scripts': payload =>
				pipe(
					Effect.tryPromise({
						catch: cause => new TerminalError({cause, message: `failed to read package.json in ${payload.cwd}`}),
						try: () => readFile(join(payload.cwd, 'package.json'), 'utf8')
					}),
					Effect.map(content => JSON.parse(content) as {readonly scripts?: Record<string, string>}),
					Effect.map(packageJson =>
						Object.entries(packageJson.scripts ?? {}).map(([name, command]) => ({
							command,
							name,
							tasks: splitParallelCommands(command)
						}))
					)
				),
			'terminal.resize': payload =>
				pipe(
					RcMap.get(terminals, terminalSession(payload)),
					Effect.flatMap(terminal => terminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': payload =>
				pipe(
					RcMap.get(terminals, terminalSession(payload)),
					Effect.flatMap(terminal => terminal.restart())
				),
			'terminal.stop': payload =>
				pipe(
					RcMap.get(terminals, terminalSession(payload)),
					Effect.flatMap(terminal => terminal.stop())
				),
			'terminal.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, terminalSession(payload)),
						Effect.map(terminal => terminal.updates)
					)
				),
			'terminal.write': payload =>
				pipe(
					RcMap.get(terminals, terminalSession(payload)),
					Effect.flatMap(terminal => terminal.write(payload.data))
				)
		})
	})
)
