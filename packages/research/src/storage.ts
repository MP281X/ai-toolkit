import {Effect, pipe, Schema} from 'effect'

import {JsonStore} from '@ai-toolkit/storage/json'

import {
	FeedItem,
	type ResearchReport,
	ResearchSession,
	type SessionId,
	StoredEvent,
	type StreamEvent,
	TopicSubscription
} from './schema.ts'

type SessionValue = typeof ResearchSession.Type
type StoredEventValue = typeof StoredEvent.Type
type FeedItemValue = typeof FeedItem.Type
type SubscriptionValue = typeof TopicSubscription.Type

const sessionsKey = 'sessions'
const feedKey = 'feed'
const subscriptionsKey = 'subscriptions'
const emptySessions: readonly SessionValue[] = []
const emptyEvents: readonly StoredEventValue[] = []
const emptyFeed: readonly FeedItemValue[] = []
const emptySubscriptions: readonly SubscriptionValue[] = []

export class ResearchStore extends Effect.Service<ResearchStore>()('@ai-toolkit/research/ResearchStore', {
	accessors: true,
	effect: Effect.gen(function* () {
		const jsonStore = yield* JsonStore

		const decodeSessions = Schema.decodeUnknownSync(Schema.Array(ResearchSession))
		const decodeEvents = Schema.decodeUnknownSync(Schema.Array(StoredEvent))
		const decodeFeed = Schema.decodeUnknownSync(Schema.Array(FeedItem))
		const decodeSubscriptions = Schema.decodeUnknownSync(Schema.Array(TopicSubscription))

		const readJson = <A>(key: string, decoder: (input: unknown) => A, fallback: A) =>
			jsonStore.read(key, decoder, fallback)

		const writeJson = (key: string, value: unknown) => jsonStore.write(key, value)

		const upsertSession = (session: SessionValue) =>
			pipe(
				readJson(sessionsKey, decodeSessions, emptySessions),
				Effect.flatMap(current =>
					writeJson(sessionsKey, [...current.filter(existing => existing.id !== session.id), session])
				),
				Effect.as(session)
			)

		const getSession = (sessionId: SessionId) =>
			pipe(
				readJson(sessionsKey, decodeSessions, emptySessions),
				Effect.flatMap(sessions => {
					const found = sessions.find(session => session.id === sessionId)
					if (!found) return Effect.fail(new Error('Session not found'))
					return Effect.succeed(found)
				})
			)

		const listSessions = () => readJson(sessionsKey, decodeSessions, emptySessions)

		const loadEvents = (sessionId: SessionId, fromEventId: number) =>
			pipe(
				readJson(`events:${sessionId}`, decodeEvents, emptyEvents),
				Effect.map(events => events.filter(event => event.eventId > fromEventId))
			)

		const appendEvent = (sessionId: SessionId, event: StreamEvent) =>
			Effect.gen(function* () {
				const events = yield* readJson(`events:${sessionId}`, decodeEvents, emptyEvents)
				const nextId = events.length
				const stored = StoredEvent.make({eventId: nextId, event})
				yield* writeJson(`events:${sessionId}`, [...events, stored])
				const session = yield* getSession(sessionId)
				yield* upsertSession(
					ResearchSession.make({
						...session,
						lastEventId: nextId,
						updatedAt: Date.now()
					})
				)
				return stored
			})

		const saveReport = (sessionId: SessionId, report: ResearchReport) =>
			Effect.gen(function* () {
				const session = yield* getSession(sessionId)
				return yield* upsertSession(
					ResearchSession.make({
						...session,
						status: 'completed',
						report,
						updatedAt: Date.now()
					})
				)
			})

		const saveFeedItem = (feedItem: FeedItem) =>
			pipe(
				readJson(feedKey, decodeFeed, emptyFeed),
				Effect.flatMap(feed => writeJson(feedKey, [feedItem, ...feed]))
			)

		const listFeedItems = () => readJson(feedKey, decodeFeed, emptyFeed)

		const saveSubscription = (subscription: TopicSubscription) =>
			pipe(
				readJson(subscriptionsKey, decodeSubscriptions, emptySubscriptions),
				Effect.flatMap(subscriptions =>
					writeJson(subscriptionsKey, [subscription, ...subscriptions.filter(item => item.id !== subscription.id)])
				)
			)

		const listSubscriptions = () => readJson(subscriptionsKey, decodeSubscriptions, emptySubscriptions)

		return {
			saveSession: upsertSession,
			getSession,
			listSessions,
			appendEvent,
			loadEvents,
			saveReport,
			saveFeedItem,
			listFeedItems,
			saveSubscription,
			listSubscriptions
		}
	})
}) {}
