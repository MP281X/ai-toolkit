import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Duration,
	Effect,
	HashMap,
	Layer,
	Option,
	RcMap,
	Ref,
	Schema,
	Stream,
	SubscriptionRef,
	pipe
} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {RpcContracts, type AgentSession, type RunScript} from '#rpcs/contracts.ts'
import {
	GitError,
	GitReviewState,
	gitReviewStateMark,
	gitReviewStateResolveComment,
	gitReviewStateSaveComment,
	gitReviewStateUnmark
} from '@deslop/git/schema'
import {GitCommand, GitCommitAction, GitReview, GitWorkspace} from '@deslop/git/service'
import {Portless} from '@deslop/portless/http'
import {TerminalError} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'

const TerminalSessionKey = Schema.Struct({
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
})
type TerminalSessionInput = {
	readonly command?: ChildProcess.StandardCommand
	readonly cwd: string
	readonly sessionId?: string
}

type PortlessScript = Omit<RunScript, 'env'> & {
	readonly env: Readonly<Record<string, string>>
	readonly preparedCommand: ChildProcess.StandardCommand
}

const emptyReviewState = new GitReviewState({comments: Array.empty(), marks: Array.empty()})

const AgentSessionKey = Schema.Struct({cwd: Schema.String, uuid: Schema.String})

function terminalSessionInput(session: typeof TerminalSessionKey.Type | TerminalSessionInput): TerminalSessionInput {
	if ('args' in session || 'env' in session) {
		return {
			command:
				session.command === undefined
					? undefined
					: ChildProcess.make(session.command, session.args ?? [], {env: session.env}),
			cwd: session.cwd,
			sessionId: session.sessionId
		}
	}
	if (typeof session.command === 'string') {
		return {command: ChildProcess.make(session.command), cwd: session.cwd, sessionId: session.sessionId}
	}

	return {command: session.command, cwd: session.cwd, sessionId: session.sessionId}
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: TerminalSessionInput) {
		const context = yield* Layer.buildWithScope(Terminal.layer(config), yield* Effect.scope)

		return Context.get(context, Terminal)
	})
})

const GitReviewSessions = RcMap.make({
	idleTimeToLive: Duration.zero,
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(
			pipe(GitReview.layer({cwd}), Layer.provide(GitCommand.layer)),
			yield* Effect.scope
		)

		return Context.get(context, GitReview)
	})
})

const GitCommitSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(
			pipe(GitCommitAction.layer({cwd}), Layer.provide(GitCommand.layer)),
			yield* Effect.scope
		)

		return Context.get(context, GitCommitAction)
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* GitWorkspace
		const terminals = yield* TerminalSessions
		const gitReviews = yield* GitReviewSessions
		const gitCommits = yield* GitCommitSessions
		const portless = yield* Portless
		const portlessScripts = yield* Ref.make(HashMap.empty<string, PortlessScript>())

		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* pipe(
					portless.scripts(cwd),
					Effect.mapError(cause => new TerminalError({cause, message: `failed to discover portless scripts in ${cwd}`}))
				)

				yield* Effect.all(
					pipe(
						scripts,
						Array.map(script =>
							Ref.update(portlessScripts, current => HashMap.set(current, script.script.sessionId, script.script))
						)
					),
					{discard: true}
				)

				return pipe(
					scripts,
					Array.map(route => ({
						baseOrigin: route.script.baseOrigin,
						command: route.script.command,
						cwd: route.script.cwd,
						name: route.script.name,
						origin: route.script.origin,
						packageFolder: route.script.packageFolder,
						packagePath: route.script.packagePath,
						portless: true,
						service: route.script.service,
						sessionId: route.script.sessionId
					}))
				)
			})
		})

		const terminalSession = Effect.fnUntraced(function* (input: typeof TerminalSessionKey.Type) {
			if (input.sessionId === undefined || input.command !== undefined) return input

			const script = pipe(yield* Ref.get(portlessScripts), HashMap.get(input.sessionId), Option.getOrUndefined)
			if (script === undefined) return input

			return {
				command: ChildProcess.make(script.preparedCommand.command, script.preparedCommand.args, {
					...script.preparedCommand.options,
					env: script.env
				}),
				cwd: script.cwd,
				sessionId: script.sessionId
			}
		})
		const getTerminal = Effect.fnUntraced(function* (input: typeof TerminalSessionKey.Type) {
			return yield* pipe(
				terminalSession(input),
				Effect.map(terminalSessionInput),
				Effect.flatMap(session => RcMap.get(terminals, session))
			)
		})

		const reviewStates = yield* RcMap.make({
			lookup: Effect.fnUntraced(function* () {
				return yield* SubscriptionRef.make(emptyReviewState)
			})
		})

		const updateReviewState = Effect.fn('RpcHandlers.updateReviewState')(function* (
			cwd: string,
			f: (state: GitReviewState) => GitReviewState
		) {
			yield* Effect.annotateCurrentSpan({cwd})
			return yield* pipe(
				Effect.scoped(
					Effect.gen(function* () {
						const ref = yield* RcMap.get(reviewStates, cwd)
						yield* SubscriptionRef.modify(ref, current => {
							const next = f(current)

							return [next, next] as const
						})
					})
				),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>>(
			HashMap.empty()
		)
		const removeAgent = Effect.fnUntraced(function* (payload: typeof AgentSessionKey.Type) {
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (session === undefined) return

			const input = terminalSessionInput({
				args: session.args,
				command: session.command,
				cwd: session.cwd,
				sessionId: session.uuid
			})
			yield* pipe(
				RcMap.get(terminals, input),
				Effect.flatMap(terminal => terminal.stop()),
				Effect.ignore
			)
			yield* pipe(RcMap.invalidate(terminals, input), Effect.ignore)
		})

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const currentAgents = yield* SubscriptionRef.get(agents)
					const labelCount = pipe(
						Array.fromIterable(HashMap.values(currentAgents)),
						Array.filter(agentSession => agentSession.cwd === payload.cwd && agentSession.command === payload.command),
						Array.length
					)
					const agentSession = {
						args: [...payload.args],
						command: payload.command,
						cwd: payload.cwd,
						icon: payload.icon,
						label: `${payload.label} ${labelCount + 1}`,
						state: {runId: 0, state: 'starting' as const, title: ''},
						uuid: randomUUID()
					}

					yield* SubscriptionRef.update(agents, sessions =>
						HashMap.set(sessions, AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid}), agentSession)
					)
					const sessionTerminal = yield* terminalSession(
						TerminalSessionKey.make({
							args: agentSession.args,
							command: agentSession.command,
							cwd: agentSession.cwd,
							sessionId: agentSession.uuid
						})
					).pipe(
						Effect.map(terminalSessionInput),
						Effect.flatMap(input => RcMap.get(terminals, input))
					)
					yield* sessionTerminal.restart()
					yield* pipe(
						sessionTerminal.stateUpdates,
						Stream.takeUntil(
							state => state.state === 'exited' || state.state === 'failed' || state.state === 'stopped'
						),
						Stream.runForEach(state =>
							Effect.gen(function* () {
								const key = AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid})
								yield* SubscriptionRef.update(agents, sessions =>
									HashMap.modifyAt(
										sessions,
										key,
										Option.match({onNone: () => Option.none(), onSome: session => Option.some({...session, state})})
									)
								)
								if (state.state !== 'exited' && state.state !== 'failed' && state.state !== 'stopped') return

								yield* SubscriptionRef.update(agents, sessions => HashMap.remove(sessions, key))
								yield* pipe(
									RcMap.invalidate(
										terminals,
										terminalSessionInput({
											args: agentSession.args,
											command: agentSession.command,
											cwd: agentSession.cwd,
											sessionId: agentSession.uuid
										})
									),
									Effect.ignore
								)
							})
						),
						Effect.forkDetach
					)

					return agentSession
				}),
			'agents.remove': payload => removeAgent(AgentSessionKey.make(payload)),
			'agents.watch': payload =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(agents),
						Effect.map(current =>
							pipe(
								Stream.make(current),
								Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agents))),
								Stream.map(sessions =>
									pipe(
										Array.fromIterable(HashMap.values(sessions)),
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
					Effect.map(SubscriptionRef.get(git.projects), projects =>
						pipe(Stream.make(projects), Stream.concat(Stream.drop(1)(SubscriptionRef.changes(git.projects))))
					)
				),
			'review.comments.resolve': payload =>
				pipe(
					updateReviewState(payload.cwd, state => gitReviewStateResolveComment(state, payload)),
					Effect.withSpan('RpcHandlers.review.comments.resolve', {
						attributes: {cwd: payload.cwd, filePath: payload.filePath}
					})
				),
			'review.comments.save': payload =>
				pipe(
					updateReviewState(payload.cwd, state => gitReviewStateSaveComment(state, payload.comment)),
					Effect.withSpan('RpcHandlers.review.comments.save', {
						attributes: {cwd: payload.cwd, filePath: payload.comment.filePath}
					})
				),
			'review.commit': payload =>
				pipe(
					RcMap.get(gitCommits, payload.cwd),
					Effect.flatMap(commit => commit.commit(payload.message))
				),
			'review.diffs': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => review.watchReviewDiffs(payload.target))
					)
				),
			'review.githubThreads': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.reviewThreads)
				),
			'review.githubThreads.resolve': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.resolveReviewThread(payload.threadId))
				),
			'review.metadata': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.metadata())
				),
			'review.push': payload =>
				pipe(
					RcMap.get(gitCommits, payload.cwd),
					Effect.flatMap(commit => commit.push())
				),
			'review.state.mark': payload =>
				pipe(
					updateReviewState(payload.cwd, state => gitReviewStateMark(state, payload.marks)),
					Effect.withSpan('RpcHandlers.review.state.mark', {
						attributes: {cwd: payload.cwd, markCount: Array.length(payload.marks)}
					})
				),
			'review.state.unmark': payload =>
				pipe(
					updateReviewState(payload.cwd, state => gitReviewStateUnmark(state, payload.marks)),
					Effect.withSpan('RpcHandlers.review.state.unmark', {
						attributes: {cwd: payload.cwd, markCount: Array.length(payload.marks)}
					})
				),
			'review.state.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(reviewStates, payload.cwd),
						Effect.flatMap(ref =>
							pipe(
								SubscriptionRef.get(ref),
								Effect.map(state => Stream.concat(Stream.drop(1)(SubscriptionRef.changes(ref)))(Stream.make(state)))
							)
						)
					)
				),
			'runs.portless': payload => RcMap.get(portlessWorktrees, payload.cwd),
			'terminal.resize': payload =>
				pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': payload =>
				Effect.flatMap(getTerminal(TerminalSessionKey.make(payload)), sessionTerminal => sessionTerminal.restart()),
			'terminal.state.watch': payload =>
				Stream.unwrap(
					Effect.map(getTerminal(TerminalSessionKey.make(payload)), sessionTerminal => sessionTerminal.stateUpdates)
				),
			'terminal.stop': payload =>
				Effect.flatMap(getTerminal(TerminalSessionKey.make(payload)), sessionTerminal => sessionTerminal.stop()),
			'terminal.watch': payload =>
				Stream.unwrap(
					Effect.map(getTerminal(TerminalSessionKey.make(payload)), sessionTerminal => sessionTerminal.updates)
				),
			'terminal.write': payload =>
				pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.write(payload.data))
				)
		})
	})
)
