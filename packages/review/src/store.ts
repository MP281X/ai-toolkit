import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {Effect, Option, pipe} from 'effect'

import * as Arr from 'effect/Array'

import {
	type AgentId,
	AgentState,
	type CommentId,
	type RepoPath,
	Repository,
	ReviewComment,
	ReviewSession,
	ReviewSummary,
	type SessionId,
	type StreamId,
	StreamState
} from './schema.ts'

const repoKey = (path: RepoPath) => `repo:${path}`
const sessionKey = (id: SessionId) => `session:${id}`
const commentKey = (id: CommentId) => `comment:${id}`
const sessionCommentsKey = (id: SessionId) => `session:${id}:comments`
const summaryKey = (id: SessionId) => `session:${id}:summary`
const streamKey = (id: StreamId) => `stream:${id}`
const agentStateKey = (id: AgentId) => `agent:${id}:state`
const reposIndexKey = 'index:repos'
const sessionsIndexKey = 'index:sessions'

export class ReviewStore extends Effect.Service<ReviewStore>()('@ai-toolkit/review/ReviewStore', {
	accessors: true,
	effect: Effect.gen(function* () {
		const kv = KeyValueStore.prefix('review:')(yield* KeyValueStore.KeyValueStore)

		const repoStore = kv.forSchema(Repository)
		const sessionStore = kv.forSchema(ReviewSession)
		const commentStore = kv.forSchema(ReviewComment)
		const summaryStore = kv.forSchema(ReviewSummary)
		const streamStore = kv.forSchema(StreamState)
		const agentStore = kv.forSchema(AgentState)

		const readIndex = (key: string) =>
			pipe(
				kv.get(key),
				Effect.map(Option.getOrElse(() => '[]')),
				Effect.map(raw => {
					try {
						const parsed = JSON.parse(raw)
						if (Arr.isArray(parsed)) return parsed.map(value => `${value}`)
						return []
					} catch {
						return []
					}
				})
			)

		const writeIndex = (key: string, values: readonly string[]) => kv.set(key, JSON.stringify(values))

		return {
			saveRepository: Effect.fnUntraced(function* (repository: Repository) {
				yield* repoStore.set(repoKey(repository.path), repository)
				const current = yield* readIndex(reposIndexKey)
				const pathString = repository.path as string
				if (!current.includes(pathString)) yield* writeIndex(reposIndexKey, [...current, pathString])
				return repository
			}),

			listRepositories: Effect.fnUntraced(function* () {
				const paths = yield* readIndex(reposIndexKey)
				return yield* Effect.forEach(paths, path =>
					pipe(
						repoStore.get(repoKey(path as RepoPath)),
						Effect.map(option =>
							Option.getOrElse(option, () =>
								Repository.make({path: path as RepoPath, name: path, lastOpenedAt: Date.now()})
							)
						)
					)
				)
			}),

			getRepository: Effect.fnUntraced(function* (path: RepoPath) {
				return yield* repoStore.get(repoKey(path))
			}),

			saveSession: Effect.fnUntraced(function* (session: ReviewSession) {
				yield* sessionStore.set(sessionKey(session.id), session)
				const current = yield* readIndex(sessionsIndexKey)
				const sessionId = session.id as string
				if (!current.includes(sessionId)) yield* writeIndex(sessionsIndexKey, [...current, sessionId])
				return session
			}),

			listSessions: Effect.fnUntraced(function* () {
				const ids = yield* readIndex(sessionsIndexKey)
				const entries = yield* Effect.forEach(ids, id => sessionStore.get(sessionKey(id as SessionId)))
				return entries.filter(Option.isSome).map(entry => entry.value)
			}),

			getSession: Effect.fnUntraced(function* (id: SessionId) {
				return yield* sessionStore.get(sessionKey(id))
			}),

			saveComment: Effect.fnUntraced(function* (comment: ReviewComment) {
				yield* commentStore.set(commentKey(comment.id), comment)
				const current = yield* readIndex(sessionCommentsKey(comment.sessionId))
				const commentId = comment.id as string
				if (!current.includes(commentId))
					yield* writeIndex(sessionCommentsKey(comment.sessionId), [...current, commentId])
				return comment
			}),

			listComments: Effect.fnUntraced(function* (sessionId: SessionId) {
				const ids = yield* readIndex(sessionCommentsKey(sessionId))
				const entries = yield* Effect.forEach(ids, id => commentStore.get(commentKey(id as CommentId)))
				return entries.filter(Option.isSome).map(entry => entry.value)
			}),

			saveSummary: Effect.fnUntraced(function* (summary: ReviewSummary) {
				yield* summaryStore.set(summaryKey(summary.sessionId), summary)
				return summary
			}),

			getSummary: Effect.fnUntraced(function* (sessionId: SessionId) {
				return yield* summaryStore.get(summaryKey(sessionId))
			}),

			saveStreamState: Effect.fnUntraced(function* (state: StreamState) {
				yield* streamStore.set(streamKey(state.id), state)
				return state
			}),

			getStreamState: Effect.fnUntraced(function* (id: StreamId) {
				return yield* streamStore.get(streamKey(id))
			}),

			saveAgentState: Effect.fnUntraced(function* (state: AgentState) {
				yield* agentStore.set(agentStateKey(state.agentId), state)
				return state
			}),

			getAgentState: Effect.fnUntraced(function* (id: AgentId) {
				return yield* agentStore.get(agentStateKey(id))
			})
		}
	})
}) {}
