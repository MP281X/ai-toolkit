import {Array, Context, Duration, Effect, FileSystem, Layer, Option, RcMap, Stream, SubscriptionRef, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'

import {ReviewState, RpcContracts} from '#rpcs/contracts.ts'
import {GitError} from '@deslop/git/schema'
import {GitWorkspace, GitWorktree} from '@deslop/git/service'
import {Terminal} from '@deslop/terminal/service'

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(Terminal.layer({cwd}), yield* Effect.scope)

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

		return RpcContracts.of({
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
			'terminal.events': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, payload.cwd),
						Effect.map(terminal => terminal.events)
					)
				),
			'terminal.input': payload =>
				pipe(
					RcMap.get(terminals, payload.cwd),
					Effect.flatMap(terminal => terminal.write(payload.data)),
					Effect.asVoid
				),
			'terminal.killPort': payload =>
				pipe(
					RcMap.get(terminals, payload.cwd),
					Effect.flatMap(terminal => terminal.killPort(payload.port))
				),
			'terminal.ports': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, payload.cwd),
						Effect.map(terminal => terminal.ports)
					)
				),
			'terminal.resize': payload =>
				pipe(
					RcMap.get(terminals, payload.cwd),
					Effect.flatMap(terminal => terminal.resize({cols: payload.cols, rows: payload.rows}))
				)
		})
	})
)
