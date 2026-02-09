import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export const RepoPath = Schema.NonEmptyString

export const RepoSummary = Schema.Struct({
	name: Schema.String,
	path: RepoPath,
	branch: Schema.String,
	stagedCount: Schema.Number,
	unstagedCount: Schema.Number
})

export const FileChange = Schema.Struct({
	path: Schema.String,
	status: Schema.String
})

export const RepoState = Schema.Struct({
	name: Schema.String,
	path: RepoPath,
	branch: Schema.String,
	staged: Schema.Array(FileChange),
	unstaged: Schema.Array(FileChange)
})

export const DiffLine = Schema.Struct({
	kind: Schema.Literal('context', 'add', 'del'),
	content: Schema.String,
	oldNumber: Schema.optional(Schema.Number),
	newNumber: Schema.optional(Schema.Number)
})

export const DiffHunk = Schema.Struct({
	id: Schema.String,
	header: Schema.String,
	oldStart: Schema.Number,
	oldLines: Schema.Number,
	newStart: Schema.Number,
	newLines: Schema.Number,
	lines: Schema.Array(DiffLine)
})

export const FileDiff = Schema.Struct({
	repoPath: RepoPath,
	filePath: Schema.String,
	staged: Schema.Boolean,
	hunks: Schema.Array(DiffHunk)
})

export const StageTarget = Schema.Union(
	Schema.Struct({
		scope: Schema.Literal('file'),
		filePath: Schema.String,
		staged: Schema.Boolean
	}),
	Schema.Struct({
		scope: Schema.Literal('hunk'),
		filePath: Schema.String,
		staged: Schema.Boolean,
		hunkId: Schema.String
	}),
	Schema.Struct({
		scope: Schema.Literal('range'),
		filePath: Schema.String,
		staged: Schema.Boolean,
		hunkId: Schema.String,
		start: Schema.Number,
		end: Schema.Number
	})
)

export const Comment = Schema.Struct({
	id: Schema.String,
	scope: Schema.Literal('global', 'file', 'range'),
	filePath: Schema.optional(Schema.String),
	hunkId: Schema.optional(Schema.String),
	start: Schema.optional(Schema.Number),
	end: Schema.optional(Schema.Number),
	text: Schema.String,
	createdAt: Schema.Number
})

export const CommentInput = Schema.Struct({
	scope: Schema.Literal('global', 'file', 'range'),
	filePath: Schema.optional(Schema.String),
	hunkId: Schema.optional(Schema.String),
	start: Schema.optional(Schema.Number),
	end: Schema.optional(Schema.Number),
	text: Schema.String
})

export const AiContent = Schema.Struct({
	commitMessages: Schema.Array(Schema.String),
	branchNames: Schema.Array(Schema.String),
	pullRequest: Schema.Struct({title: Schema.String, body: Schema.String}),
	plan: Schema.String
})

export const PlanExport = Schema.Struct({markdown: Schema.String})

export const PullRequestResult = Schema.Struct({
	output: Schema.String,
	url: Schema.optional(Schema.String)
})

export class ReposRpcs extends RpcGroup.make(
	Rpc.make('ListRoots', {success: Schema.Array(RepoPath)}),
	Rpc.make('AddRoot', {payload: RepoPath, success: Schema.Array(RepoPath)}),
	Rpc.make('RemoveRoot', {payload: RepoPath, success: Schema.Array(RepoPath)}),
	Rpc.make('ListRepositories', {success: Schema.Array(RepoSummary)}),
	Rpc.make('ScanRepositories', {success: Schema.Array(RepoSummary)}),
	Rpc.make('GetRepository', {payload: RepoPath, success: RepoState}),
	Rpc.make('GetDiff', {
		payload: Schema.Struct({repoPath: RepoPath, filePath: Schema.String, staged: Schema.Boolean}),
		success: FileDiff
	}),
	Rpc.make('StageTargets', {
		payload: Schema.Struct({repoPath: RepoPath, targets: Schema.Array(StageTarget)}),
		success: RepoState
	}),
	Rpc.make('RevertTargets', {
		payload: Schema.Struct({repoPath: RepoPath, targets: Schema.Array(StageTarget)}),
		success: RepoState
	}),
	Rpc.make('ListComments', {payload: RepoPath, success: Schema.Array(Comment)}),
	Rpc.make('SaveComment', {
		payload: Schema.Struct({repoPath: RepoPath, comment: CommentInput}),
		success: Schema.Array(Comment)
	}),
	Rpc.make('GenerateContent', {
		payload: RepoPath,
		success: AiContent
	}),
	Rpc.make('ExportPlan', {
		payload: RepoPath,
		success: PlanExport
	}),
	Rpc.make('CreatePullRequest', {
		payload: Schema.Struct({
			repoPath: RepoPath,
			title: Schema.String,
			body: Schema.String,
			branch: Schema.String
		}),
		success: PullRequestResult
	})
).middleware(AuthMiddleware) {}
