import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {Array, Context, Duration, Effect, Layer, RcMap, Stream, SubscriptionRef, pipe} from 'effect'

import type {AgentSession} from '#rpcs/contracts.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {GitWorkspace, GitWorktree} from '@deslop/git/service'
import {TerminalError} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'

type TerminalSessionKey = {
	readonly args?: readonly string[]
	readonly command?: string
	readonly cwd: string
	readonly sessionId?: string
}

function terminalSessionKey(input: TerminalSessionKey) {
	return JSON.stringify({args: input.args, command: input.command, cwd: input.cwd, sessionId: input.sessionId})
}

function agentSessionId(uuid: string) {
	return `agent:${uuid}`
}

function agentSessionKey(input: {readonly cwd: string; readonly uuid: string}) {
	return JSON.stringify(input)
}

function splitParallelCommands(script: string) {
	const commands: string[] = []
	let current = ''
	let quote: '"' | "'" | undefined
	let escaped = false

	for (let index = 0; index < script.length; index += 1) {
		const char = script[index]
		if (escaped) {
			current += char
			escaped = false
		} else if (char === '\\') {
			current += char
			escaped = true
		} else if (quote) {
			current += char
			if (char === quote) quote = undefined
		} else if (char === '"' || char === "'") {
			current += char
			quote = char
		} else if (char === '&' && script[index + 1] === '&') {
			current += '&&'
			index += 1
		} else if (char === '&') {
			const command = current.trim()
			if (command) commands.push(command)
			current = ''
		} else {
			current += char
		}
	}

	const command = current.trim()
	if (command) commands.push(command)

	return commands
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (key: string) {
		const config = JSON.parse(key) as TerminalSessionKey
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

		function terminal(payload: TerminalSessionKey) {
			return RcMap.get(terminals, terminalSessionKey(payload))
		}

		function agentList(cwd: string, sessions: ReadonlyMap<string, AgentSession>) {
			return pipe(
				Array.fromIterable(sessions.values()),
				Array.filter(session => session.cwd === cwd)
			)
		}

		function removeAgent(cwd: string, uuid: string) {
			return SubscriptionRef.update(agents, current => {
				const next = new Map(current)
				next.delete(agentSessionKey({cwd, uuid}))
				return next
			})
		}

		function watchAgentTerminal(session: AgentSession) {
			return pipe(
				terminal({
					args: session.args,
					command: session.command,
					cwd: session.cwd,
					sessionId: agentSessionId(session.uuid)
				}),
				Effect.flatMap(terminal =>
					pipe(
						SubscriptionRef.changes(terminal.state),
						Stream.map(state => state.status.state),
						Stream.filter(state => state === 'exited' || state === 'failed' || state === 'stopped'),
						Stream.take(1),
						Stream.runDrain
					)
				),
				Effect.andThen(removeAgent(session.cwd, session.uuid)),
				Effect.forkScoped
			)
		}

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const current = yield* SubscriptionRef.get(agents)
					const labelCount = pipe(
						agentList(payload.cwd, current),
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
					yield* watchAgentTerminal(session)

					return session
				}),
			'agents.remove': payload => removeAgent(payload.cwd, payload.uuid),
			'agents.watch': payload =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(agents),
						Effect.map(current =>
							pipe(
								Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agents)))(Stream.make(current)),
								Stream.map(sessions => agentList(payload.cwd, sessions))
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
			'terminal.events': payload =>
				Stream.unwrap(
					pipe(
						terminal(payload),
						Effect.map(terminal => terminal.events)
					)
				),
			'terminal.input': payload =>
				pipe(
					terminal(payload),
					Effect.flatMap(terminal => terminal.write(payload.data)),
					Effect.asVoid
				),
			'terminal.killPort': payload =>
				pipe(
					terminal({cwd: payload.cwd}),
					Effect.flatMap(terminal => terminal.killPort(payload.port))
				),
			'terminal.ports': payload =>
				Stream.unwrap(
					pipe(
						terminal(payload),
						Effect.map(terminal =>
							pipe(
								SubscriptionRef.changes(terminal.state),
								Stream.map(state => state.ports)
							)
						)
					)
				),
			'terminal.resize': payload =>
				pipe(
					terminal(payload),
					Effect.flatMap(terminal => terminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': payload =>
				pipe(
					terminal(payload),
					Effect.flatMap(terminal => terminal.restart)
				),
			'terminal.state': payload =>
				Stream.unwrap(
					pipe(
						terminal(payload),
						Effect.map(terminal => SubscriptionRef.changes(terminal.state))
					)
				),
			'terminal.status': payload =>
				Stream.unwrap(
					pipe(
						terminal(payload),
						Effect.map(terminal =>
							pipe(
								SubscriptionRef.changes(terminal.state),
								Stream.map(state => state.status)
							)
						)
					)
				),
			'terminal.stop': payload =>
				pipe(
					terminal(payload),
					Effect.flatMap(terminal => terminal.stop),
					Effect.asVoid
				)
		})
	})
)
