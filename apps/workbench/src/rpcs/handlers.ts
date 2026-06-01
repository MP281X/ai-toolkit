import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

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
	Record,
	Result,
	Schema,
	Stream,
	SubscriptionRef,
	pipe
} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import {ReviewState, RpcContracts, type AgentSession} from '#rpcs/contracts.ts'
import {GitError} from '@deslop/git/schema'
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

const AgentSessionKey = Schema.Struct({cwd: Schema.String, uuid: Schema.String})

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: typeof TerminalSessionKey.Type) {
		const context = yield* Layer.buildWithScope(Terminal.layer(config), yield* Effect.scope)

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
		const fs = yield* FileSystem.FileSystem
		const reviewStore = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, ReviewState)

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
				Effect.map(Option.getOrElse(() => new ReviewState({comments: Array.empty(), marks: Array.empty()}))),
				Effect.orElseSucceed(() => new ReviewState({comments: Array.empty(), marks: Array.empty()}))
			)
		})

		const reviewStates = yield* RcMap.make({
			idleTimeToLive: Duration.minutes(5),
			lookup: Effect.fnUntraced(function* (key: string) {
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
		const agents = yield* SubscriptionRef.make<HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>>(
			HashMap.empty()
		)

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const current = yield* SubscriptionRef.get(agents)
					const labelCount = pipe(
						Array.fromIterable(HashMap.values(current)),
						Array.filter(session => session.cwd === payload.cwd && session.command === payload.command),
						Array.length
					)
					const session = {
						args: [...payload.args],
						command: payload.command,
						cwd: payload.cwd,
						icon: payload.icon,
						label: `${payload.label} ${labelCount + 1}`,
						uuid: randomUUID()
					}

					yield* SubscriptionRef.update(agents, sessions =>
						HashMap.set(sessions, AgentSessionKey.make({cwd: session.cwd, uuid: session.uuid}), session)
					)
					const terminal = yield* RcMap.get(
						terminals,
						TerminalSessionKey.make({
							args: session.args,
							command: session.command,
							cwd: session.cwd,
							sessionId: session.uuid
						})
					)
					yield* terminal.restart()
					yield* pipe(
						terminal.updates,
						Stream.filterMap(update =>
							update.type === 'state' ? Result.succeed(update.state.state) : Result.failVoid
						),
						Stream.filter(state => state === 'exited' || state === 'failed' || state === 'stopped'),
						Stream.take(1),
						Stream.runDrain,
						Effect.andThen(
							SubscriptionRef.update(agents, current =>
								HashMap.remove(current, AgentSessionKey.make({cwd: session.cwd, uuid: session.uuid}))
							)
						),
						Effect.forkDetach
					)

					return session
				}),
			'agents.remove': payload =>
				SubscriptionRef.update(agents, current =>
					HashMap.remove(current, AgentSessionKey.make({cwd: payload.cwd, uuid: payload.uuid}))
				),
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
					pipe(
						SubscriptionRef.get(git.projects),
						Effect.map(projects =>
							pipe(Stream.make(projects), Stream.concat(Stream.drop(1)(SubscriptionRef.changes(git.projects))))
						)
					)
				),
			'review.comments.delete': payload =>
				updateReviewState(payload, state => {
					const key = commentKey(payload)

					return new ReviewState({
						comments: Array.filter(state.comments, comment => commentKey(comment) !== key),
						marks: state.marks
					})
				}),
			'review.comments.save': payload =>
				updateReviewState(payload, state => {
					const key = commentKey(payload.comment)

					return new ReviewState({
						comments: Array.append(
							Array.filter(state.comments, comment => commentKey(comment) !== key),
							payload.comment
						),
						marks: state.marks
					})
				}),
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
			'review.state.mark': payload =>
				updateReviewState(payload, state => {
					const keys = new Set(Array.map(payload.marks, markKey))

					return new ReviewState({
						comments: state.comments,
						marks: Array.appendAll(
							Array.filter(state.marks, mark => !keys.has(markKey(mark))),
							payload.marks
						)
					})
				}),
			'review.state.unmark': payload =>
				updateReviewState(payload, state => {
					const keys = new Set(Array.map(payload.marks, markKey))

					return new ReviewState({
						comments: state.comments,
						marks: Array.filter(state.marks, mark => !keys.has(markKey(mark)))
					})
				}),
			'review.state.watch': payload =>
				Stream.unwrap(
					pipe(
						reviewStateKey(payload),
						Effect.flatMap(key => RcMap.get(reviewStates, key)),
						Effect.flatMap(ref =>
							pipe(
								SubscriptionRef.get(ref),
								Effect.map(state => Stream.concat(Stream.drop(1)(SubscriptionRef.changes(ref)))(Stream.make(state)))
							)
						)
					)
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
					Effect.map(
						Schema.decodeUnknownSync(
							Schema.fromJsonString(
								Schema.Struct({scripts: Schema.optional(Schema.Record(Schema.String, Schema.String))})
							)
						)
					),
					Effect.map(packageJson =>
						pipe(
							packageJson.scripts ?? {},
							Record.toEntries,
							Array.map(([name, command]) => ({command, name, tasks: splitParallelCommands(command)}))
						)
					)
				),
			'terminal.ports': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, TerminalSessionKey.make(payload)),
						Effect.map(terminal => terminal.ports)
					)
				),
			'terminal.resize': payload =>
				pipe(
					RcMap.get(terminals, TerminalSessionKey.make(payload)),
					Effect.flatMap(terminal => terminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': payload =>
				pipe(
					RcMap.get(terminals, TerminalSessionKey.make(payload)),
					Effect.flatMap(terminal => terminal.restart())
				),
			'terminal.stop': payload =>
				pipe(
					RcMap.get(terminals, TerminalSessionKey.make(payload)),
					Effect.flatMap(terminal => terminal.stop())
				),
			'terminal.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, TerminalSessionKey.make(payload)),
						Effect.map(terminal => terminal.updates)
					)
				),
			'terminal.write': payload =>
				pipe(
					RcMap.get(terminals, TerminalSessionKey.make(payload)),
					Effect.flatMap(terminal => terminal.write(payload.data))
				)
		})
	})
)
