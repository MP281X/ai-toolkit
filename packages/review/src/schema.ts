import {Schema} from 'effect'

import {RepoPath} from '@ai-toolkit/git/schema'

export type SessionId = typeof SessionId.Type
export const SessionId = Schema.String.pipe(Schema.brand('SessionId'))

export type CommentId = typeof CommentId.Type
export const CommentId = Schema.String.pipe(Schema.brand('CommentId'))

export const Timestamp = Schema.Number

type SessionDraftProps = {
	readonly repoPath: RepoPath
	readonly title: string
	readonly globalSummary?: string
}
export class SessionDraft extends Schema.Class<SessionDraftProps>('SessionDraft')({
	repoPath: RepoPath,
	title: Schema.String,
	globalSummary: Schema.optional(Schema.String)
}) {}

type ReviewSessionProps = {
	readonly id: SessionId
	readonly repoPath: RepoPath
	readonly title: string
	readonly createdAt: number
	readonly updatedAt: number
	readonly globalSummary?: string
}
export class ReviewSession extends Schema.Class<ReviewSessionProps>('ReviewSession')({
	id: SessionId,
	repoPath: RepoPath,
	title: Schema.String,
	createdAt: Timestamp,
	updatedAt: Timestamp,
	globalSummary: Schema.optional(Schema.String)
}) {}

type CommentDraftProps = {
	readonly sessionId: SessionId
	readonly repoPath: RepoPath
	readonly filePath: string
	readonly hunkId: string
	readonly lineTag: 'context' | 'add' | 'del'
	readonly oldLine?: number
	readonly newLine?: number
	readonly message: string
}
export class CommentDraft extends Schema.Class<CommentDraftProps>('CommentDraft')({
	sessionId: SessionId,
	repoPath: RepoPath,
	filePath: Schema.String,
	hunkId: Schema.String,
	lineTag: Schema.Literal('context', 'add', 'del'),
	oldLine: Schema.optional(Schema.Number),
	newLine: Schema.optional(Schema.Number),
	message: Schema.String
}) {}

type ReviewCommentProps = {
	readonly id: CommentId
	readonly sessionId: SessionId
	readonly repoPath: RepoPath
	readonly filePath: string
	readonly hunkId: string
	readonly lineTag: 'context' | 'add' | 'del'
	readonly oldLine?: number
	readonly newLine?: number
	readonly message: string
	readonly createdAt: number
}
export class ReviewComment extends Schema.Class<ReviewCommentProps>('ReviewComment')({
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

type ReviewSummaryProps = {
	readonly sessionId: SessionId
	readonly repoPath: RepoPath
	readonly summary: string
	readonly updatedAt: number
}
export class ReviewSummary extends Schema.Class<ReviewSummaryProps>('ReviewSummary')({
	sessionId: SessionId,
	repoPath: RepoPath,
	summary: Schema.String,
	updatedAt: Timestamp
}) {}
