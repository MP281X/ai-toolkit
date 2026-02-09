import {Schema} from 'effect'

export type RepoPath = typeof RepoPath.Type
export const RepoPath = Schema.String.pipe(Schema.brand('RepoPath'))

export type SessionId = typeof SessionId.Type
export const SessionId = Schema.String.pipe(Schema.brand('SessionId'))

export type CommentId = typeof CommentId.Type
export const CommentId = Schema.String.pipe(Schema.brand('CommentId'))

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.String.pipe(Schema.brand('AgentId'))

export type StreamId = typeof StreamId.Type
export const StreamId = Schema.String.pipe(Schema.brand('StreamId'))

export const Timestamp = Schema.Number

export class Repository extends Schema.Class<Repository>('Repository')({
	path: RepoPath,
	name: Schema.String,
	defaultBranch: Schema.optional(Schema.String),
	lastOpenedAt: Timestamp
}) {}

export class RepoStatus extends Schema.Class<RepoStatus>('RepoStatus')({
	branch: Schema.optional(Schema.String),
	ahead: Schema.Number,
	behind: Schema.Number,
	staged: Schema.Array(Schema.String),
	unstaged: Schema.Array(Schema.String),
	untracked: Schema.Array(Schema.String)
}) {}

export class DiffLineContext extends Schema.TaggedClass<DiffLineContext>()('context', {
	text: Schema.String,
	oldLine: Schema.Number,
	newLine: Schema.Number
}) {}

export class DiffLineAdd extends Schema.TaggedClass<DiffLineAdd>()('add', {
	text: Schema.String,
	newLine: Schema.Number
}) {}

export class DiffLineDel extends Schema.TaggedClass<DiffLineDel>()('del', {
	text: Schema.String,
	oldLine: Schema.Number
}) {}

export type DiffLine = typeof DiffLine.Type
export const DiffLine = Schema.Union(DiffLineContext, DiffLineAdd, DiffLineDel)

export class DiffHunk extends Schema.Class<DiffHunk>('DiffHunk')({
	id: Schema.String,
	oldStart: Schema.Number,
	oldLines: Schema.Number,
	newStart: Schema.Number,
	newLines: Schema.Number,
	header: Schema.String,
	lines: Schema.Array(DiffLine)
}) {}

export class DiffFile extends Schema.Class<DiffFile>('DiffFile')({
	path: Schema.String,
	oldPath: Schema.optional(Schema.String),
	status: Schema.Literal('modified', 'added', 'deleted', 'renamed'),
	isBinary: Schema.Boolean,
	hunks: Schema.Array(DiffHunk)
}) {}

export class DiffQuery extends Schema.Class<DiffQuery>('DiffQuery')({
	repoPath: RepoPath,
	source: Schema.Literal('working', 'staged')
}) {}

export class StageSelection extends Schema.Class<StageSelection>('StageSelection')({
	repoPath: RepoPath,
	path: Schema.String,
	kind: Schema.Literal('file', 'directory', 'hunk', 'line'),
	hunkId: Schema.optional(Schema.String),
	oldLine: Schema.optional(Schema.Number),
	newLine: Schema.optional(Schema.Number),
	patch: Schema.optional(Schema.String),
	reverse: Schema.optional(Schema.Boolean)
}) {}

export class SessionDraft extends Schema.Class<SessionDraft>('SessionDraft')({
	repoPath: RepoPath,
	title: Schema.String,
	globalSummary: Schema.optional(Schema.String)
}) {}

export class ReviewSession extends Schema.Class<ReviewSession>('ReviewSession')({
	id: SessionId,
	repoPath: RepoPath,
	title: Schema.String,
	createdAt: Timestamp,
	updatedAt: Timestamp,
	globalSummary: Schema.optional(Schema.String)
}) {}

export class CommentDraft extends Schema.Class<CommentDraft>('CommentDraft')({
	sessionId: SessionId,
	repoPath: RepoPath,
	filePath: Schema.String,
	hunkId: Schema.String,
	lineTag: Schema.Literal('context', 'add', 'del'),
	oldLine: Schema.optional(Schema.Number),
	newLine: Schema.optional(Schema.Number),
	message: Schema.String
}) {}

export class ReviewComment extends Schema.Class<ReviewComment>('ReviewComment')({
	id: CommentId,
	sessionId: SessionId,
	repoPath: RepoPath,
	filePath: Schema.String,
	hunkId: Schema.String,
	lineTag: Schema.Literal('context', 'add', 'del'),
	oldLine: Schema.optional(Schema.Number),
	newLine: Schema.optional(Schema.Number),
	message: Schema.String,
	createdAt: Timestamp
}) {}

export class StreamState extends Schema.Class<StreamState>('StreamState')({
	id: StreamId,
	position: Schema.Number,
	buffer: Schema.String,
	updatedAt: Timestamp
}) {}

export class QuestionOption extends Schema.Class<QuestionOption>('QuestionOption')({
	id: Schema.String,
	label: Schema.String
}) {}

export class AgentQuestion extends Schema.TaggedClass<AgentQuestion>()('question', {
	agentId: AgentId,
	sessionId: SessionId,
	questionId: Schema.String,
	prompt: Schema.String,
	options: Schema.Array(QuestionOption),
	allowFreeform: Schema.Boolean
}) {}

export class AgentLog extends Schema.TaggedClass<AgentLog>()('log', {
	agentId: AgentId,
	sessionId: SessionId,
	message: Schema.String,
	timestamp: Timestamp
}) {}

export class AgentProgress extends Schema.TaggedClass<AgentProgress>()('progress', {
	agentId: AgentId,
	sessionId: SessionId,
	message: Schema.String,
	stage: Schema.String,
	timestamp: Timestamp
}) {}

export class AgentError extends Schema.TaggedClass<AgentError>()('agent-error', {
	agentId: AgentId,
	sessionId: SessionId,
	error: Schema.String,
	timestamp: Timestamp
}) {}

export class AgentDone extends Schema.TaggedClass<AgentDone>()('agent-done', {
	agentId: AgentId,
	sessionId: SessionId,
	timestamp: Timestamp
}) {}

export class AgentMessage extends Schema.TaggedClass<AgentMessage>()('agent-message', {
	agentId: AgentId,
	sessionId: SessionId,
	role: Schema.Literal('assistant', 'system'),
	content: Schema.String,
	timestamp: Timestamp
}) {}

export class AgentAnswer extends Schema.Class<AgentAnswer>('AgentAnswer')({
	agentId: AgentId,
	sessionId: SessionId,
	questionId: Schema.String,
	answer: Schema.String,
	selectedOption: Schema.optional(QuestionOption),
	submittedAt: Timestamp
}) {}

export class AgentRunRequest extends Schema.Class<AgentRunRequest>('AgentRunRequest')({
	agentId: AgentId,
	sessionId: SessionId,
	repoPath: RepoPath,
	comments: Schema.Array(ReviewComment),
	globalSummary: Schema.optional(Schema.String),
	message: Schema.optional(Schema.String)
}) {}

export type AgentEvent = typeof AgentEvent.Type
export const AgentEvent = Schema.Union(AgentQuestion, AgentLog, AgentProgress, AgentError, AgentDone, AgentMessage)

export class AgentState extends Schema.Class<AgentState>('AgentState')({
	agentId: AgentId,
	sessionId: SessionId,
	status: Schema.Literal('idle', 'running', 'waiting_for_answer', 'completed', 'failed'),
	lastEventAt: Timestamp
}) {}

export class CommitSuggestion extends Schema.Class<CommitSuggestion>('CommitSuggestion')({
	message: Schema.String,
	branch: Schema.String,
	description: Schema.String
}) {}

export class ReviewSummary extends Schema.Class<ReviewSummary>('ReviewSummary')({
	sessionId: SessionId,
	repoPath: RepoPath,
	summary: Schema.String,
	updatedAt: Timestamp
}) {}
