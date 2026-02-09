import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {Effect, Option, Schema} from 'effect'

import {
	type CommentId,
	ReviewComment,
	ReviewSession,
	ReviewSummary,
	type SessionId
} from './schema.ts'

const sessionKey = (id: SessionId) => `session:${id}`
const commentKey = (id: CommentId) => `comment:${id}`
const sessionCommentsKey = (id: SessionId) => `session:${id}:comments`
const summaryKey = (id: SessionId) => `session:${id}:summary`
const sessionsIndexKey = 'index:sessions'

export class ReviewStore extends Effect.Service<ReviewStore>()('@ai-toolkit/review/ReviewStore', {
	accessors: true,
	effect: Effect.gen(function* () {
		const kv = KeyValueStore.prefix('review:')(yield* KeyValueStore.KeyValueStore)

		const sessionStore = kv.forSchema(ReviewSession)
		const commentStore = kv.forSchema(ReviewComment)
		const summaryStore = kv.forSchema(ReviewSummary)
		const indexStore = kv.forSchema(Schema.Array(Schema.String))

		function readIndex(key: string) {
			return indexStore.get(key).pipe(Effect.map(option => Option.getOrElse(option, () => [] as readonly string[])))
		}

		function writeIndex(key: string, values: readonly string[]) {
			return indexStore.set(key, values)
		}

		return {
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
			})
		}
	})
}) {}
