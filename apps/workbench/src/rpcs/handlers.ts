import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Duration,
	Effect,
	FileSystem,
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

import {KeyValueStore} from 'effect/unstable/persistence'
import {ChildProcess} from 'effect/unstable/process'

import {ReviewComment, ReviewState, RpcContracts, type AgentSession, type RunScript} from '#rpcs/contracts.ts'
import {GitError} from '@deslop/git/schema'
import {GitWorkspace, GitWorktree} from '@deslop/git/service'
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

const emptyReviewState = new ReviewState({comments: Array.empty(), marks: Array.empty()})

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

function commentKey(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
}) {
	return `${input.filePath}:${input.side ?? 'additions'}:${input.lineNumber}`
}

function markKey(input: {readonly filePath: string; readonly fingerprint: string; readonly segmentId: string}) {
	return `${input.filePath}:${input.segmentId}:${input.fingerprint}`
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fn('TerminalSessions.lookup')(function* (config: TerminalSessionInput) {
		const context = yield* Layer.buildWithScope(Terminal.layer(config), yield* Effect.scope)

		return Context.get(context, Terminal)
	})
})

const GitWorktreeSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fn('GitWorktreeSessions.lookup')(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitWorktree.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitWorktree)
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* GitWorkspace
		const terminals = yield* TerminalSessions
		const gitWorktrees = yield* GitWorktreeSessions
		const fs = yield* FileSystem.FileSystem
		const portless = yield* Portless
		const portlessScripts = yield* Ref.make(HashMap.empty<string, PortlessScript>())
		const reviewStore = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, ReviewState)

		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fn('PortlessWorktrees.lookup')(function* (cwd: string) {
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

		const reviewStateKey = Effect.fnUntraced(function* (input: {readonly base: string; readonly cwd: string}) {
			const root = yield* pipe(
				fs.realPath(input.cwd),
				Effect.orElseSucceed(() => input.cwd)
			)

			return Buffer.from(`${root}\u0000${input.base}`, 'utf8').toString('base64url')
		})

		const readReviewState = Effect.fnUntraced(function* (key: string) {
			return yield* pipe(
				reviewStore.get(`review-state/${key}`),
				Effect.map(Option.getOrElse(() => emptyReviewState)),
				Effect.orElseSucceed(() => emptyReviewState)
			)
		})

		const reviewStates = yield* RcMap.make({
			idleTimeToLive: Duration.minutes(5),
			lookup: Effect.fn('ReviewStates.lookup')(function* (key: string) {
				return yield* SubscriptionRef.make(yield* readReviewState(key))
			})
		})

		const updateReviewState = Effect.fnUntraced(function* (
			input: {readonly base: string; readonly cwd: string},
			f: (state: ReviewState) => ReviewState
		) {
			return yield* pipe(
				Effect.scoped(
					Effect.gen(function* () {
						const key = yield* reviewStateKey(input)
						const ref = yield* RcMap.get(reviewStates, key)
						const state = yield* SubscriptionRef.modify(ref, current => {
							const next = f(current)

							return [next, next] as const
						})
						yield* reviewStore.set(`review-state/${key}`, state)
					})
				),
				Effect.mapError(cause => new GitError({cause}))
			)
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>>(
			HashMap.empty()
		)

		return RpcContracts.of({
			'agents.create': Effect.fnUntraced(function* (payload) {
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
					uuid: randomUUID()
				}

				yield* SubscriptionRef.update(agents, sessions =>
					HashMap.set(sessions, AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid}), agentSession)
				)
				const sessionTerminal = yield* pipe(
					terminalSession(
						TerminalSessionKey.make({
							args: agentSession.args,
							command: agentSession.command,
							cwd: agentSession.cwd,
							sessionId: agentSession.uuid
						})
					),
					Effect.map(terminalSessionInput),
					Effect.flatMap(input => RcMap.get(terminals, input))
				)
				yield* sessionTerminal.restart()
				yield* pipe(
					sessionTerminal.stateUpdates,
					Stream.map(state => state.state),
					Stream.filter(state => state === 'exited' || state === 'failed' || state === 'stopped'),
					Stream.take(1),
					Stream.runDrain,
					Effect.andThen(
						SubscriptionRef.update(agents, sessions =>
							HashMap.remove(sessions, AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid}))
						)
					),
					Effect.forkDetach
				)

				return agentSession
			}),
			'agents.remove': Effect.fnUntraced(function* (payload) {
				yield* SubscriptionRef.update(agents, current =>
					HashMap.remove(current, AgentSessionKey.make({cwd: payload.cwd, uuid: payload.uuid}))
				)
			}),
			'agents.watch': payload =>
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
					),
					Stream.unwrap
				),
			'projects.branches': Effect.fnUntraced(function* (payload) {
				return yield* git.branches(payload.cwd)
			}),
			'projects.createWorktree': Effect.fnUntraced(function* (payload) {
				return yield* git.createWorktree(payload)
			}),
			'projects.deleteWorktree': Effect.fnUntraced(function* (payload) {
				return yield* git.deleteWorktree(payload)
			}),
			'projects.watch': () =>
				pipe(
					SubscriptionRef.get(git.projects),
					Effect.map(projects =>
						pipe(Stream.make(projects), Stream.concat(Stream.drop(1)(SubscriptionRef.changes(git.projects))))
					),
					Stream.unwrap
				),
			'review.comments.resolve': Effect.fnUntraced(function* (payload) {
				yield* updateReviewState(payload, state => {
					const key = commentKey(payload)

					return new ReviewState({
						comments: Array.filter(state.comments, comment => commentKey(comment) !== key),
						marks: state.marks
					})
				})
			}),
			'review.comments.save': Effect.fnUntraced(function* (payload) {
				yield* updateReviewState(payload, state => {
					const key = commentKey(payload.comment)

					return new ReviewState({
						comments: Array.append(
							Array.filter(state.comments, comment => commentKey(comment) !== key),
							new ReviewComment({...payload.comment, resolved: false})
						),
						marks: state.marks
					})
				})
			}),
			'review.commitAndPush': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.commitAndPush({base: payload.base, message: payload.message}))
				)
			}),
			'review.createWipCommit': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.createWipCommit(payload.message))
				)
			}),
			'review.discardFile': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.discardFile(payload.filePath))
				)
			}),
			'review.githubThreads': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.reviewThreads())
				)
			}),
			'review.githubThreads.resolve': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.resolveReviewThread(payload.threadId))
				)
			}),
			'review.metadata': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.metadata({base: payload.base}))
				)
			}),
			'review.stageFile': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.stageFile(payload.filePath))
				)
			}),
			'review.state.mark': Effect.fnUntraced(function* (payload) {
				yield* updateReviewState(payload, state => {
					const keys = new Set(Array.map(payload.marks, markKey))

					return new ReviewState({
						comments: state.comments,
						marks: Array.appendAll(
							Array.filter(state.marks, mark => !keys.has(markKey(mark))),
							payload.marks
						)
					})
				})
			}),
			'review.state.unmark': Effect.fnUntraced(function* (payload) {
				yield* updateReviewState(payload, state => {
					const keys = new Set(Array.map(payload.marks, markKey))

					return new ReviewState({
						comments: state.comments,
						marks: Array.filter(state.marks, mark => !keys.has(markKey(mark)))
					})
				})
			}),
			'review.state.watch': payload =>
				pipe(
					reviewStateKey(payload),
					Effect.flatMap(key => RcMap.get(reviewStates, key)),
					Effect.flatMap(ref =>
						pipe(
							SubscriptionRef.get(ref),
							Effect.map(state => Stream.concat(Stream.drop(1)(SubscriptionRef.changes(ref)))(Stream.make(state)))
						)
					),
					Stream.unwrap
				),
			'review.unstageFile': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.unstageFile(payload.filePath))
				)
			}),
			'review.watchRange': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.map(worktree => worktree.watchReviewRangeDiffs({from: payload.from, to: payload.to})),
					Stream.unwrap
				),
			'runs.portless': Effect.fnUntraced(function* (payload) {
				return yield* RcMap.get(portlessWorktrees, payload.cwd)
			}),
			'terminal.resize': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.resize({cols: payload.cols, rows: payload.rows}))
				)
			}),
			'terminal.restart': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.restart())
				)
			}),
			'terminal.state.watch': payload =>
				pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.map(sessionTerminal => sessionTerminal.stateUpdates),
					Stream.unwrap
				),
			'terminal.stop': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.stop())
				)
			}),
			'terminal.watch': payload =>
				pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.map(sessionTerminal => sessionTerminal.updates),
					Stream.unwrap
				),
			'terminal.write': Effect.fnUntraced(function* (payload) {
				return yield* pipe(
					getTerminal(TerminalSessionKey.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.write(payload.data))
				)
			})
		})
	})
)
