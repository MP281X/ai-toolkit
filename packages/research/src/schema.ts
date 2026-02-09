import {pipe, Schema} from 'effect'

import {QuestionAnswered, QuestionId, QuestionRaised} from '@ai-toolkit/ai/schema'

export type SessionId = typeof SessionId.Type
export const SessionId = pipe(Schema.String, Schema.brand('SessionId'))

export type FeedItemId = typeof FeedItemId.Type
export const FeedItemId = pipe(Schema.String, Schema.brand('FeedItemId'))

export type SubscriptionId = typeof SubscriptionId.Type
export const SubscriptionId = pipe(Schema.String, Schema.brand('SubscriptionId'))

export type ResearchMode = typeof ResearchMode.Type
export const ResearchMode = Schema.Literal('fast', 'deep')

export class PlanStep extends Schema.Class<PlanStep>('PlanStep')({
	id: Schema.String,
	title: Schema.String,
	detail: Schema.String,
	status: Schema.Literal('pending', 'running', 'done')
}) {}

export class Citation extends Schema.Class<Citation>('Citation')({
	title: Schema.String,
	url: Schema.String,
	summary: Schema.String,
	publishedAt: Schema.optional(Schema.String),
	source: Schema.optional(Schema.String)
}) {}

export class AgentTask extends Schema.Class<AgentTask>('AgentTask')({
	agentId: Schema.String,
	role: Schema.String,
	status: Schema.Literal('pending', 'running', 'done'),
	summary: Schema.optional(Schema.String),
	citations: Schema.optional(Schema.Array(Citation))
}) {}

export class ResearchReport extends Schema.Class<ResearchReport>('ResearchReport')({
	title: Schema.String,
	summary: Schema.String,
	body: Schema.String,
	citations: Schema.Array(Citation)
}) {}

export class ResearchSession extends Schema.Class<ResearchSession>('ResearchSession')({
	id: SessionId,
	mode: ResearchMode,
	topic: Schema.String,
	status: Schema.Literal('running', 'paused', 'completed', 'failed'),
	createdAt: Schema.Number,
	updatedAt: Schema.Number,
	lastEventId: Schema.Number,
	pendingQuestion: Schema.optional(QuestionId),
	report: Schema.optional(ResearchReport)
}) {}

export class SessionStarted extends Schema.TaggedClass<SessionStarted>()('session-started', {
	sessionId: SessionId,
	mode: ResearchMode,
	topic: Schema.String,
	startedAt: Schema.Number
}) {}

export class PlanReady extends Schema.TaggedClass<PlanReady>()('plan-ready', {
	sessionId: SessionId,
	steps: Schema.Array(PlanStep)
}) {}

export class ProgressEvent extends Schema.TaggedClass<ProgressEvent>()('progress', {
	sessionId: SessionId,
	message: Schema.String,
	ratio: Schema.Number
}) {}

export class AgentStarted extends Schema.TaggedClass<AgentStarted>()('agent-started', {
	sessionId: SessionId,
	agentId: Schema.String,
	role: Schema.String
}) {}

export class AgentChunk extends Schema.TaggedClass<AgentChunk>()('agent-chunk', {
	sessionId: SessionId,
	agentId: Schema.String,
	text: Schema.String
}) {}

export class AgentCompleted extends Schema.TaggedClass<AgentCompleted>()('agent-completed', {
	sessionId: SessionId,
	agentId: Schema.String,
	summary: Schema.String,
	citations: Schema.Array(Citation)
}) {}

export class TokenEvent extends Schema.TaggedClass<TokenEvent>()('token', {
	sessionId: SessionId,
	kind: Schema.Literal('text', 'reasoning'),
	text: Schema.String
}) {}

export class Checkpointed extends Schema.TaggedClass<Checkpointed>()('checkpoint', {
	sessionId: SessionId,
	eventId: Schema.Number
}) {}

export class ReportReady extends Schema.TaggedClass<ReportReady>()('report-ready', {
	sessionId: SessionId,
	report: ResearchReport
}) {}

export class RunFailed extends Schema.TaggedClass<RunFailed>()('run-failed', {
	sessionId: SessionId,
	message: Schema.String
}) {}

export type StreamEvent = typeof StreamEvent.Type
export const StreamEvent = Schema.Union(
	SessionStarted,
	PlanReady,
	ProgressEvent,
	AgentStarted,
	AgentChunk,
	AgentCompleted,
	TokenEvent,
	QuestionRaised,
	QuestionAnswered,
	Checkpointed,
	ReportReady,
	RunFailed
)

export class StoredEvent extends Schema.Class<StoredEvent>('StoredEvent')({
	eventId: Schema.Number,
	event: StreamEvent
}) {}

export class FeedItem extends Schema.Class<FeedItem>('FeedItem')({
	id: FeedItemId,
	sessionId: SessionId,
	topic: Schema.String,
	mode: ResearchMode,
	createdAt: Schema.Number,
	report: ResearchReport
}) {}

export class TopicSubscription extends Schema.Class<TopicSubscription>('TopicSubscription')({
	id: SubscriptionId,
	topic: Schema.String,
	intervalMs: Schema.Number,
	model: Schema.String
}) {}

export {QuestionAnswered, QuestionId, QuestionRaised}
