import {Schema} from 'effect'

import {Model} from '@ai-toolkit/ai/schema'

export const SearchMode = Schema.Literal('normal', 'deep', 'council')
export type SearchMode = Schema.Schema.Type<typeof SearchMode>

export class SearchError extends Schema.TaggedError<SearchError>()('SearchError', {
	message: Schema.String
}) {}

export class SearchRequest extends Schema.Class<SearchRequest>('SearchRequest')({
	query: Schema.String,
	mode: SearchMode,
	model: Model,
	councilModels: Schema.optional(Schema.Array(Model)),
	jobId: Schema.optional(Schema.String)
}) {}

export class Citation extends Schema.Class<Citation>('Citation')({
	id: Schema.Number,
	title: Schema.String,
	url: Schema.String,
	publishedDate: Schema.optional(Schema.String),
	snippet: Schema.optional(Schema.String)
}) {}

export class PlanTask extends Schema.Class<PlanTask>('PlanTask')({
	title: Schema.String,
	query: Schema.String,
	deliverable: Schema.String
}) {}

export class PlanPhase extends Schema.Class<PlanPhase>('PlanPhase')({
	title: Schema.String,
	tasks: Schema.Array(PlanTask)
}) {}

export class ResearchPlan extends Schema.Class<ResearchPlan>('ResearchPlan')({
	phases: Schema.Array(PlanPhase)
}) {}

export const TaskStatus = Schema.Literal('pending', 'running', 'completed', 'failed')
export type TaskStatus = Schema.Schema.Type<typeof TaskStatus>

export class TaskResult extends Schema.Class<TaskResult>('TaskResult')({
	phaseIndex: Schema.Number,
	taskIndex: Schema.Number,
	status: TaskStatus,
	notes: Schema.optional(Schema.String),
	claims: Schema.optional(Schema.Array(Schema.String)),
	citations: Schema.optional(Schema.Array(Schema.Number)),
	sources: Schema.optional(Schema.Array(Citation))
}) {}

export class SearchAnswer extends Schema.Class<SearchAnswer>('SearchAnswer')({
	text: Schema.String,
	citations: Schema.Array(Schema.Number)
}) {}

export class SearchHistoryEntry extends Schema.Class<SearchHistoryEntry>('SearchHistoryEntry')({
	id: Schema.String,
	query: Schema.String,
	mode: SearchMode,
	model: Model,
	councilModels: Schema.optional(Schema.Array(Model)),
	answer: SearchAnswer,
	sources: Schema.Array(Citation),
	plan: Schema.optional(ResearchPlan),
	tasks: Schema.optional(Schema.Array(TaskResult)),
	jobId: Schema.optional(Schema.String),
	createdAt: Schema.Number
}) {}

export const JobStatus = Schema.Literal('running', 'completed', 'failed')
export type JobStatus = Schema.Schema.Type<typeof JobStatus>

export class SearchJob extends Schema.Class<SearchJob>('SearchJob')({
	id: Schema.String,
	request: SearchRequest,
	status: JobStatus,
	sources: Schema.optional(Schema.Array(Citation)),
	plan: Schema.optional(ResearchPlan),
	tasks: Schema.optional(Schema.Array(TaskResult)),
	answer: Schema.optional(SearchAnswer),
	error: Schema.optional(Schema.String),
	updatedAt: Schema.Number
}) {}

export class SearchStarted extends Schema.TaggedClass<SearchStarted>()('search-started', {
	request: SearchRequest,
	jobId: Schema.optional(Schema.String)
}) {}

export class PlanGenerated extends Schema.TaggedClass<PlanGenerated>()('plan-generated', {
	plan: ResearchPlan
}) {}

export class TaskUpdated extends Schema.TaggedClass<TaskUpdated>()('task-updated', {
	task: TaskResult
}) {}

export class SourcesReady extends Schema.TaggedClass<SourcesReady>()('sources-ready', {
	sources: Schema.Array(Citation)
}) {}

export class AnswerDelta extends Schema.TaggedClass<AnswerDelta>()('answer-delta', {
	chunk: Schema.String,
	citations: Schema.optional(Schema.Array(Schema.Number))
}) {}

export class AnswerCompleted extends Schema.TaggedClass<AnswerCompleted>()('answer-completed', {
	answer: SearchAnswer,
	sources: Schema.Array(Citation),
	plan: Schema.optional(ResearchPlan),
	tasks: Schema.optional(Schema.Array(TaskResult)),
	jobId: Schema.optional(Schema.String)
}) {}

export class CouncilAnswer extends Schema.TaggedClass<CouncilAnswer>()('council-answer', {
	model: Model,
	answer: SearchAnswer
}) {}

export class JobSnapshot extends Schema.TaggedClass<JobSnapshot>()('job-snapshot', {
	job: SearchJob
}) {}

export class HistoryStored extends Schema.TaggedClass<HistoryStored>()('history-stored', {
	entry: SearchHistoryEntry
}) {}

export type SearchStreamPart = typeof SearchStreamPart.Type
export const SearchStreamPart = Schema.Union(
	SearchStarted,
	PlanGenerated,
	TaskUpdated,
	SourcesReady,
	AnswerDelta,
	AnswerCompleted,
	CouncilAnswer,
	JobSnapshot,
	HistoryStored
)
