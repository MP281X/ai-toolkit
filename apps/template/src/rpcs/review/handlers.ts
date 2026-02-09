import {Effect, Stream, pipe} from 'effect'

import {answerQuestion, AgentAnswer, AgentRunRequest, runAgent} from '@ai-toolkit/ai/review'
import {commitSuggestions} from '@ai-toolkit/ai/commit'
import {GitService} from '@ai-toolkit/git/service'
import {GitStore} from '@ai-toolkit/git/store'
import {DiffQuery, type RepoPath, Repository, StageSelection} from '@ai-toolkit/git/schema'
import {
	type CommentDraft,
	type CommentId,
	ReviewComment,
	ReviewSession,
	ReviewSummary,
	type SessionDraft,
	type SessionId
} from '@ai-toolkit/review/schema'
import {ReviewStore} from '@ai-toolkit/review/store'

import {ReviewRpcs} from './contracts.ts'

function touchRepository(repository: Repository) {
	return Repository.make({
		...repository,
		lastOpenedAt: Date.now()
	})
}

function buildRepository(path: RepoPath) {
	const name = path.split('/').filter(Boolean).at(-1) ?? `${path}`
	return Repository.make({
		path,
		name,
		lastOpenedAt: Date.now()
	})
}

function buildSession(draft: SessionDraft) {
	return ReviewSession.make({
		id: crypto.randomUUID() as SessionId,
		repoPath: draft.repoPath,
		title: draft.title,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		globalSummary: draft.globalSummary
	})
}

function buildComment(draft: CommentDraft) {
	return ReviewComment.make({
		...draft,
		id: crypto.randomUUID() as CommentId,
		createdAt: Date.now()
	})
}

export const ReviewLive = ReviewRpcs.toLayer(
	Effect.gen(function* () {
		const store = yield* ReviewStore
		const git = yield* GitService
		const repos = yield* GitStore

		function listRepositories() {
			return pipe(repos.listRepositories(), Effect.orDie)
		}

		function saveRepository(repository: Repository) {
			return pipe(repos.saveRepository(touchRepository(repository)), Effect.orDie)
		}

		function status(repoPath: RepoPath) {
			return pipe(git.status(repoPath), Effect.tap(() => repos.saveRepository(buildRepository(repoPath))), Effect.orDie)
		}

		function diff(query: DiffQuery) {
			return pipe(git.diff(query), Effect.orDie)
		}

		function stage(selection: StageSelection) {
			return Effect.gen(function* () {
				const diffValue =
					selection.kind === 'file' || selection.kind === 'directory'
						? undefined
						: yield* pipe(git.diff(DiffQuery.make({repoPath: selection.repoPath, source: 'working'})), Effect.orDie)
				return yield* pipe(git.stage(selection, diffValue), Effect.as(null), Effect.orDie)
			})
		}

		function listSessions() {
			return pipe(store.listSessions(), Effect.orDie)
		}

		function createSession(draft: SessionDraft) {
			return pipe(store.saveSession(buildSession(draft)), Effect.orDie)
		}

		function listComments(sessionId: SessionId) {
			return pipe(store.listComments(sessionId), Effect.orDie)
		}

		function addComment(draft: CommentDraft) {
			return pipe(store.saveComment(buildComment(draft)), Effect.orDie)
		}

		function saveSummary(summary: ReviewSummary) {
			return pipe(
				store.saveSummary(
					ReviewSummary.make({
						...summary,
						updatedAt: Date.now()
					})
				),
				Effect.orDie
			)
		}

		function getSummary(sessionId: SessionId) {
			return pipe(store.getSummary(sessionId), Effect.orDie)
		}

		function suggestions(repoPath: RepoPath) {
			return pipe(commitSuggestions(repoPath), Effect.orDie)
		}

		function runAgentStream(request: AgentRunRequest) {
			return pipe(runAgent(request), Stream.orDie)
		}

		return ReviewRpcs.of({
			ListRepositories: listRepositories,
			SaveRepository: saveRepository,
			Status: status,
			Diff: diff,
			Stage: stage,
			ListSessions: listSessions,
			CreateSession: createSession,
			ListComments: listComments,
			AddComment: addComment,
			SaveSummary: saveSummary,
			GetSummary: getSummary,
			CommitSuggestions: suggestions,
			RunAgent: runAgentStream,
			AnswerAgent: (answer: AgentAnswer) => answerQuestion(answer)
		})
	})
)
