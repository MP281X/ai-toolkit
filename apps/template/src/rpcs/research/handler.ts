import {Effect, pipe, Stream} from 'effect'

import {ResearchEngine} from '@ai-toolkit/research/service'

import {ResearchRpcs} from './contracts.ts'

export const ResearchLive = ResearchRpcs.toLayer(
	Effect.gen(function* () {
		const research = yield* ResearchEngine

		return ResearchRpcs.of({
			StartFastResearch: input => pipe(research.startFastResearch(input), Stream.orDie),
			StartDeepResearch: input => pipe(research.startDeepResearch(input), Stream.orDie),
			ResumeSession: input => pipe(research.resumeSession(input.sessionId, input.fromEventId), Stream.orDie),
			AnswerQuestion: input =>
				pipe(
					research.answerQuestion({
						sessionId: input.sessionId,
						questionId: input.questionId,
						answer: input.answer,
						model: input.model
					}),
					Stream.orDie
				),
			ListSessions: () => pipe(research.listSessions(), Effect.orDie),
			ListFeed: () => pipe(research.listFeed(), Effect.orDie),
			SubscribeTopic: input =>
				pipe(
					research.subscribeTopics({
						topic: input.topic,
						intervalMs: input.intervalMs,
						model: input.model
					}),
					Effect.orDie
				)
		})
	})
)
