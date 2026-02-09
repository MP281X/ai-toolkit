import {Effect, Stream} from 'effect'

import {ResearchEngine} from '@ai-toolkit/research/service'

import {ResearchRpcs} from './contracts.ts'

export const ResearchLive = ResearchRpcs.toLayer(
	Effect.gen(function* () {
		const research = yield* ResearchEngine

		return ResearchRpcs.of({
			StartFastResearch: input => research.startFastResearch(input).pipe(Stream.orDie),
			StartDeepResearch: input => research.startDeepResearch(input).pipe(Stream.orDie),
			ResumeSession: input => research.resumeSession(input.sessionId, input.fromEventId).pipe(Stream.orDie),
			AnswerQuestion: input =>
				research
					.answerQuestion({
						sessionId: input.sessionId,
						questionId: input.questionId,
						answer: input.answer,
						model: input.model
					})
					.pipe(Stream.orDie),
			ListSessions: () => research.listSessions.pipe(Effect.orDie),
			ListFeed: () => research.listFeed.pipe(Effect.orDie),
			SubscribeTopic: input =>
				research
					.subscribeTopics({
						topic: input.topic,
						intervalMs: input.intervalMs,
						model: input.model
					})
					.pipe(Effect.orDie)
		})
	})
)
