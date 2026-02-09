import {Effect, Stream} from 'effect'

import {answerQuestion, runAgent} from '@ai-toolkit/review/agent'
import {commitSuggestions} from '@ai-toolkit/review/commit'
import {GitService} from '@ai-toolkit/review/git'
import {
	type AgentAnswer,
	AgentEvent,
	AgentRunRequest,
	type CommentDraft,
	CommitSuggestion,
	DiffFile,
	DiffQuery,
	type RepoPath,
	RepoStatus,
	Repository,
	ReviewComment,
	ReviewSession,
	ReviewSummary,
	type SessionDraft,
	type SessionId,
	StageSelection
} from '@ai-toolkit/review/schema'
import {ReviewStore} from '@ai-toolkit/review/store'

import {ReviewRpcs} from './contracts.ts'

const now = () => Date.now()

const withTimestamp = (repository: Repository) =>
	Repository.make({
		...repository,
		lastOpenedAt: now()
	})

const buildRepository = (path: RepoPath) => {
	const name = path.split('/').filter(Boolean).at(-1) ?? `${path}`
	return Repository.make({
		path,
		name,
		lastOpenedAt: now()
	})
}

const buildSession = (draft: SessionDraft) =>
	ReviewSession.make({
		id: crypto.randomUUID() as SessionId,
		repoPath: draft.repoPath,
		title: draft.title,
		createdAt: now(),
		updatedAt: now(),
		globalSummary: draft.globalSummary
	})

const buildComment = (draft: CommentDraft) =>
	ReviewComment.make({
		...draft,
		id: crypto.randomUUID(),
		createdAt: now()
	})

export const ReviewLive = ReviewRpcs.toLayer(
	Effect.gen(function* () {
		const store = yield* ReviewStore
		const git = yield* GitService

		return ReviewRpcs.of({
			ListRepositories: () => store.listRepositories,

			SaveRepository: repository => store.saveRepository(withTimestamp(repository)),

			Status: repoPath => git.status(repoPath).pipe(Effect.tap(() => store.saveRepository(buildRepository(repoPath)))),

			Diff: query => git.diff(query),

			Stage: selection =>
				Effect.gen(function* () {
					const diff =
						selection.kind === 'file' || selection.kind === 'directory'
							? undefined
							: yield* git.diff(DiffQuery.make({repoPath: selection.repoPath, source: 'working'}))
					return yield* git.stage(selection, diff)
				}),

			ListSessions: () => store.listSessions,

			CreateSession: draft => store.saveSession(buildSession(draft)),

			ListComments: sessionId => store.listComments(sessionId),

			AddComment: draft => store.saveComment(buildComment(draft)),

			SaveSummary: summary =>
				store.saveSummary(
					ReviewSummary.make({
						...summary,
						updatedAt: now()
					})
				),

			GetSummary: sessionId => store.getSummary(sessionId),

			CommitSuggestions: repoPath => commitSuggestions(repoPath),

			RunAgent: request => runAgent(request),

			AnswerAgent: (answer: AgentAnswer) => answerQuestion(answer)
		})
	})
)
