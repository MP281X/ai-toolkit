import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {Model} from '@ai-toolkit/ai/schema'
import {
	FeedItem,
	QuestionId,
	ResearchSession,
	SessionId,
	StoredEvent,
	TopicSubscription
} from '@ai-toolkit/research/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class ResearchRpcs extends RpcGroup.make(
	Rpc.make('StartFastResearch', {
		payload: Schema.Struct({topic: Schema.String, model: Model}),
		success: StoredEvent,
		stream: true
	}),
	Rpc.make('StartDeepResearch', {
		payload: Schema.Struct({topic: Schema.String, model: Model}),
		success: StoredEvent,
		stream: true
	}),
	Rpc.make('ResumeSession', {
		payload: Schema.Struct({sessionId: SessionId, fromEventId: Schema.Number}),
		success: StoredEvent,
		stream: true
	}),
	Rpc.make('AnswerQuestion', {
		payload: Schema.Struct({
			sessionId: SessionId,
			questionId: QuestionId,
			answer: Schema.String,
			model: Model
		}),
		success: StoredEvent,
		stream: true
	}),
	Rpc.make('ListSessions', {
		success: Schema.Array(ResearchSession)
	}),
	Rpc.make('ListFeed', {
		success: Schema.Array(FeedItem)
	}),
	Rpc.make('SubscribeTopic', {
		payload: Schema.Struct({topic: Schema.String, intervalMs: Schema.Number, model: Schema.String}),
		success: TopicSubscription
	})
).middleware(AuthMiddleware) {}
