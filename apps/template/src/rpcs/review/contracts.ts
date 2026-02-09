import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AgentAnswer, AgentEvent, AgentRunRequest} from '@ai-toolkit/ai/review'
import {CommitSuggestion} from '@ai-toolkit/ai/commit'
import {DiffFile, DiffQuery, RepoPath, RepoStatus, Repository, StageSelection} from '@ai-toolkit/git/schema'
import {CommentDraft, ReviewComment, ReviewSession, ReviewSummary, SessionDraft, SessionId} from '@ai-toolkit/review/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class ReviewRpcs extends RpcGroup.make(
	Rpc.make('ListRepositories', {
		success: Schema.Array(Repository)
	}),
	Rpc.make('SaveRepository', {
		payload: Repository,
		success: Repository
	}),
	Rpc.make('Status', {
		payload: RepoPath,
		success: RepoStatus
	}),
	Rpc.make('Diff', {
		payload: DiffQuery,
		success: Schema.Array(DiffFile)
	}),
	Rpc.make('Stage', {
		payload: StageSelection,
		success: Schema.Null
	}),
	Rpc.make('ListSessions', {
		success: Schema.Array(ReviewSession)
	}),
	Rpc.make('CreateSession', {
		payload: SessionDraft,
		success: ReviewSession
	}),
	Rpc.make('ListComments', {
		payload: SessionId,
		success: Schema.Array(ReviewComment)
	}),
	Rpc.make('AddComment', {
		payload: CommentDraft,
		success: ReviewComment
	}),
	Rpc.make('SaveSummary', {
		payload: ReviewSummary,
		success: ReviewSummary
	}),
	Rpc.make('GetSummary', {
		payload: SessionId,
		success: Schema.OptionFromNullishOr(ReviewSummary, null)
	}),
	Rpc.make('CommitSuggestions', {
		payload: RepoPath,
		success: Schema.Array(CommitSuggestion)
	}),
	Rpc.make('RunAgent', {
		payload: AgentRunRequest,
		success: AgentEvent,
		stream: true
	}),
	Rpc.make('AnswerAgent', {
		payload: AgentAnswer,
		success: Schema.String
	})
).middleware(AuthMiddleware) {}
