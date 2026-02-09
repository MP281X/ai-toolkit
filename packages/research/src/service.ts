import {Effect, Option, Predicate, pipe, Ref, Schedule, Schema, Stream} from 'effect'

import type {Model, StreamPart} from '@ai-toolkit/ai/schema'
import {Model as ModelSchema} from '@ai-toolkit/ai/schema'
import {AiSdk} from '@ai-toolkit/ai/service'
import * as Arr from 'effect/Array'
import * as Queue from 'effect/Queue'

import {
	AgentCompleted,
	AgentStarted,
	Checkpointed,
	Citation,
	FeedItem,
	FeedItemId,
	PlanReady,
	PlanStep,
	ProgressEvent,
	QuestionAnswered,
	QuestionId,
	QuestionRaised,
	ReportReady,
	type ResearchMode,
	ResearchReport,
	ResearchSession,
	RunFailed,
	SessionId,
	SessionStarted,
	type StoredEvent,
	type StreamEvent,
	SubscriptionId,
	TokenEvent,
	TopicSubscription
} from './schema.ts'
import {ResearchStore} from './storage.ts'

const decodeSessionId = Schema.decodeUnknownSync(SessionId)
const decodeQuestionId = Schema.decodeUnknownSync(QuestionId)
const decodeFeedItemId = Schema.decodeUnknownSync(FeedItemId)
const decodeSubscriptionId = Schema.decodeUnknownSync(SubscriptionId)
const decodeModel = Schema.decodeUnknownSync(ModelSchema)

type StartInput = {
	topic: string
	model: Model
}

type AnswerInput = {
	sessionId: SessionId
	questionId: QuestionId
	answer: string
	model: Model
}

type SubscriptionInput = {
	topic: string
	intervalMs: number
	model: string
}

export class ResearchEngine extends Effect.Service<ResearchEngine>()('@ai-toolkit/research/ResearchEngine', {
	accessors: true,
	effect: Effect.gen(function* () {
		const aiSdk = yield* AiSdk
		const store = yield* ResearchStore
		const queues = yield* Ref.make(new Map<string, Queue.Queue<StoredEvent>>())

		const getQueue = (sessionId: SessionId) =>
			Effect.gen(function* () {
				const key = globalThis.String(sessionId)
				const current = yield* Ref.get(queues)
				const existing = current.get(key)
				if (existing) return existing
				const queue = yield* Queue.unbounded<StoredEvent>()
				yield* Ref.update(queues, map => {
					const next = new Map(map)
					next.set(key, queue)
					return next
				})
				return queue
			})

		const persistEvent = (sessionId: SessionId, event: StreamEvent) =>
			pipe(
				store.appendEvent(sessionId, event),
				Effect.tap(stored =>
					pipe(
						getQueue(sessionId),
						Effect.flatMap(queue => Queue.offer(queue, stored))
					)
				)
			)

		const streamFor = (sessionId: SessionId, fromEventId: number) => {
			const historical = Stream.fromIterableEffect(store.loadEvents(sessionId, fromEventId))
			const live = Stream.unwrapScoped(
				pipe(
					getQueue(sessionId),
					Effect.map(queue => Stream.fromQueue(queue))
				)
			)

			return Stream.concat(historical, live)
		}

		const updateSessionStatus = (sessionId: SessionId, status: ResearchSession['status']) =>
			Effect.gen(function* () {
				const session = yield* store.getSession(sessionId)
				return yield* store.saveSession(
					ResearchSession.make({
						...session,
						status,
						updatedAt: Date.now()
					})
				)
			})

		const createSession = (mode: ResearchMode, topic: string) =>
			Effect.gen(function* () {
				const sessionId = decodeSessionId(globalThis.crypto.randomUUID())
				const session = ResearchSession.make({
					id: sessionId,
					mode,
					topic,
					status: 'running',
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastEventId: -1
				})
				yield* store.saveSession(session)
				return session
			})

		const seedPlan = (sessionId: SessionId, steps: readonly PlanStep[]) =>
			Effect.all(
				[
					persistEvent(
						sessionId,
						PlanReady.make({
							sessionId,
							steps
						})
					),
					persistEvent(
						sessionId,
						ProgressEvent.make({
							sessionId,
							message: 'Planning',
							ratio: 0.1
						})
					)
				],
				{concurrency: 'unbounded'}
			)

		const mapSearchOutput = (output: unknown): readonly Citation[] => {
			if (!Predicate.isRecord(output)) return []
			if (!Predicate.hasProperty('results')(output)) return []
			const provider = Predicate.hasProperty('provider')(output) ? globalThis.String(output['provider']) : undefined
			const results = output['results']
			if (!Arr.isArray(results)) return []
			return results
				.filter(
					result =>
						Predicate.isRecord(result) && Predicate.hasProperty('url')(result) && Predicate.hasProperty('title')(result)
				)
				.map(result =>
					Citation.make({
						title: globalThis.String(result['title']),
						url: globalThis.String(result['url']),
						summary: Predicate.hasProperty('text')(result) ? globalThis.String(result['text']) : 'Referenced source',
						publishedAt: Predicate.hasProperty('publishedDate')(result)
							? globalThis.String(result['publishedDate'])
							: undefined,
						source: provider
					})
				)
		}

		const mapStreamPart =
			(sessionId: SessionId, textRef: Ref.Ref<string>, citationsRef: Ref.Ref<readonly Citation[]>) =>
			(part: StreamPart) => {
				if (part._tag === 'text-delta')
					return pipe(
						Ref.update(textRef, current => current + part.text),
						Effect.as(
							Option.some(
								TokenEvent.make({
									sessionId,
									kind: 'text',
									text: part.text
								})
							)
						)
					)

				if (part._tag === 'reasoning-delta')
					return pipe(
						Ref.update(textRef, current => current + part.text),
						Effect.as(
							Option.some(
								TokenEvent.make({
									sessionId,
									kind: 'reasoning',
									text: part.text
								})
							)
						)
					)

				if (part._tag === 'tool-result')
					return pipe(
						Ref.update(citationsRef, current => [...current, ...mapSearchOutput(part.output)]),
						Effect.as(Option.none<StreamEvent>())
					)

				if (part._tag === 'error')
					return Effect.succeed(
						Option.some(
							RunFailed.make({
								sessionId,
								message: globalThis.String(part.error)
							})
						)
					)

				if (part._tag === 'finish')
					return Effect.succeed(
						Option.some(
							ProgressEvent.make({
								sessionId,
								message: 'Complete',
								ratio: 1
							})
						)
					)

				return Effect.succeed(Option.none<StreamEvent>())
			}

		const fastPrompt = (topic: string) =>
			[
				'You are an AI research agent.',
				'Deliver a concise report with citations and a short summary.',
				`Topic: ${topic}`
			].join('\n')

		const deepPlan = () => [
			PlanStep.make({id: 'discover', title: 'Discover', detail: 'Search diverse sources', status: 'running'}),
			PlanStep.make({id: 'analyze', title: 'Analyze', detail: 'Extract key claims and evidence', status: 'pending'}),
			PlanStep.make({
				id: 'synthesize',
				title: 'Synthesize',
				detail: 'Merge findings into a coherent report',
				status: 'pending'
			})
		]

		const runAiStream = (input: StartInput, sessionId: SessionId, prefix: string) =>
			Effect.gen(function* () {
				const textRef = yield* Ref.make(prefix)
				const citationsRef = yield* Ref.make<readonly Citation[]>([])
				const stream = aiSdk.stream({model: input.model, prompt: `${prefix}\n\n${input.topic}`})

				const persisted = pipe(
					stream,
					Stream.mapEffect(mapStreamPart(sessionId, textRef, citationsRef)),
					Stream.filterMap(option => option),
					Stream.mapEffect(event => persistEvent(sessionId, event))
				)

				const finalize = Stream.fromEffect(
					Effect.gen(function* () {
						const summary = yield* Ref.get(textRef)
						const citations = yield* Ref.get(citationsRef)
						const report = ResearchReport.make({
							title: input.topic,
							summary: summary.slice(0, 280),
							body: summary,
							citations
						})
						yield* store.saveReport(sessionId, report)
						const stored = yield* persistEvent(
							sessionId,
							ReportReady.make({
								sessionId,
								report
							})
						)
						yield* store.saveFeedItem(
							FeedItem.make({
								id: decodeFeedItemId(globalThis.crypto.randomUUID()),
								sessionId,
								topic: input.topic,
								mode: 'fast',
								createdAt: Date.now(),
								report
							})
						)
						yield* persistEvent(
							sessionId,
							Checkpointed.make({
								sessionId,
								eventId: stored.eventId
							})
						)
						yield* updateSessionStatus(sessionId, 'completed')
						return stored
					})
				)

				return Stream.concat(persisted, finalize)
			})

		const startFastResearch = (input: StartInput) =>
			Stream.unwrap(
				Effect.gen(function* () {
					const session = yield* createSession('fast', input.topic)
					const intro = Stream.fromIterable([
						yield* persistEvent(
							session.id,
							SessionStarted.make({
								sessionId: session.id,
								mode: 'fast',
								topic: input.topic,
								startedAt: Date.now()
							})
						)
					])
					const seeded = Stream.unwrap(
						pipe(
							seedPlan(session.id, deepPlan()),
							Effect.map(events => Stream.fromIterable(events))
						)
					)
					const body = yield* runAiStream(input, session.id, fastPrompt(input.topic))

					return Stream.concat(intro, Stream.concat(seeded, body))
				})
			)

		const questionEvent = (sessionId: SessionId) =>
			QuestionRaised.make({
				sessionId,
				questionId: decodeQuestionId(globalThis.crypto.randomUUID()),
				prompt: 'Choose focus',
				options: ['Broad', 'Concise', 'Technical'],
				allowFreeText: true
			})

		const startDeepResearch = (input: StartInput) =>
			Stream.unwrap(
				Effect.gen(function* () {
					const session = yield* createSession('deep', input.topic)
					const start = yield* persistEvent(
						session.id,
						SessionStarted.make({
							sessionId: session.id,
							mode: 'deep',
							topic: input.topic,
							startedAt: Date.now()
						})
					)
					const planEvents = yield* seedPlan(session.id, deepPlan())
					const question = questionEvent(session.id)
					const latest = yield* store.getSession(session.id)
					yield* store.saveSession(
						ResearchSession.make({
							...latest,
							status: 'paused',
							pendingQuestion: question.questionId
						})
					)
					const ask = yield* persistEvent(session.id, question)
					return Stream.fromIterable([start, ...planEvents, ask])
				})
			)

		const runSubAgent = (sessionId: SessionId, agentId: string, prompt: string, model: Model) =>
			Effect.gen(function* () {
				yield* persistEvent(
					sessionId,
					AgentStarted.make({
						sessionId,
						agentId,
						role: prompt
					})
				)
				const textRef = yield* Ref.make('')
				const citationsRef = yield* Ref.make<readonly Citation[]>([])
				const stream = aiSdk.stream({model, prompt})

				const persisted = pipe(
					stream,
					Stream.mapEffect(mapStreamPart(sessionId, textRef, citationsRef)),
					Stream.filterMap(option => option),
					Stream.mapEffect(event => persistEvent(sessionId, event))
				)

				yield* Stream.runDrain(persisted)
				const summary = yield* Ref.get(textRef)
				const citations = yield* Ref.get(citationsRef)
				yield* persistEvent(
					sessionId,
					AgentCompleted.make({
						sessionId,
						agentId,
						summary,
						citations
					})
				)
				return {summary, citations}
			})

		const council = (
			sessionId: SessionId,
			input: StartInput,
			findings: readonly {summary: string; citations: readonly Citation[]}[]
		) =>
			Effect.gen(function* () {
				const combined = findings.map(finding => finding.summary).join('\n')
				const mergedCitations = findings.flatMap(finding => finding.citations)
				const report = ResearchReport.make({
					title: `${input.topic} — council`,
					summary: combined.slice(0, 280),
					body: combined,
					citations: mergedCitations
				})
				yield* store.saveReport(sessionId, report)
				const stored = yield* persistEvent(
					sessionId,
					ReportReady.make({
						sessionId,
						report
					})
				)
				yield* store.saveFeedItem(
					FeedItem.make({
						id: decodeFeedItemId(globalThis.crypto.randomUUID()),
						sessionId,
						topic: input.topic,
						mode: 'deep',
						createdAt: Date.now(),
						report
					})
				)
				yield* persistEvent(
					sessionId,
					Checkpointed.make({
						sessionId,
						eventId: stored.eventId
					})
				)
				yield* updateSessionStatus(sessionId, 'completed')
			})

		const resumeDeepResearch = (answerInput: AnswerInput) =>
			Stream.unwrap(
				Effect.gen(function* () {
					const session = yield* store.getSession(answerInput.sessionId)
					yield* persistEvent(
						answerInput.sessionId,
						QuestionAnswered.make({
							sessionId: answerInput.sessionId,
							questionId: answerInput.questionId,
							answer: answerInput.answer
						})
					)
					const refreshed = yield* store.getSession(answerInput.sessionId)
					yield* store.saveSession(
						ResearchSession.make({
							...refreshed,
							status: 'running',
							pendingQuestion: undefined
						})
					)

					yield* Effect.forkDaemon(
						Effect.gen(function* () {
							const agents = [
								runSubAgent(
									answerInput.sessionId,
									'search',
									`Collect fresh sources about ${session.topic}`,
									answerInput.model
								),
								runSubAgent(
									answerInput.sessionId,
									'evidence',
									`Extract evidence and facts about ${session.topic}`,
									answerInput.model
								),
								runSubAgent(
									answerInput.sessionId,
									'gaps',
									`List open questions and gaps for ${session.topic}`,
									answerInput.model
								)
							]

							const findings = yield* Effect.all(agents, {concurrency: 'unbounded'})

							yield* council(answerInput.sessionId, {topic: session.topic, model: answerInput.model}, findings)
						})
					)

					return streamFor(answerInput.sessionId, session.lastEventId)
				})
			)

		const listFeed = store.listFeedItems
		const listSessions = store.listSessions

		const subscribeTopics = (input: SubscriptionInput) =>
			Effect.gen(function* () {
				const subscription = TopicSubscription.make({
					id: decodeSubscriptionId(input.topic),
					topic: input.topic,
					intervalMs: input.intervalMs,
					model: input.model
				})
				yield* store.saveSubscription(subscription)
				return subscription
			})

		const scheduler = pipe(
			Effect.gen(function* () {
				const subscriptions = yield* store.listSubscriptions()
				yield* Effect.forEach(subscriptions, subscription =>
					Effect.forkDaemon(
						pipe(
							startDeepResearch({
								topic: subscription.topic,
								model: decodeModel(`opencode_zen:${subscription.model}`)
							}),
							Stream.runDrain
						)
					)
				)
			}),
			Effect.repeat(Schedule.spaced('5 minutes'))
		)

		yield* Effect.forkScoped(scheduler)

		return {
			startFastResearch,
			startDeepResearch,
			resumeSession: streamFor,
			answerQuestion: resumeDeepResearch,
			listFeed,
			listSessions,
			subscribeTopics
		}
	})
}) {}
