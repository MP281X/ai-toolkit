import {Schema} from 'effect'

import {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {AgentToolKit} from '@ai-toolkit/ai/tools'
import {GitBranch, GitDiff, GitDiffScope, GitRepository, GitWorktree} from '@ai-toolkit/git/schema'
import {Response} from 'effect/unstable/ai'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export type AgentStreamPart = typeof AgentStreamPart.Type
export const AgentStreamPart = Response.StreamPart(AgentToolKit)

export type AgentEvent = typeof AgentEvent.Type
export const AgentEvent = Schema.Union([
	Schema.Struct({
		prompt: Schema.NonEmptyString,
		runId: Schema.NonEmptyString,
		type: Schema.Literal('user-message')
	}),
	Schema.Struct({
		part: AgentStreamPart,
		runId: Schema.NonEmptyString,
		type: Schema.Literal('agent-part')
	})
])

export class ProjectEntry extends Schema.Class<ProjectEntry>('ProjectEntry')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}

export class ProjectsSnapshot extends Schema.Class<ProjectsSnapshot>('ProjectsSnapshot')({
	fetchFailed: Schema.Boolean,
	fetchedAt: Schema.optional(Schema.Number),
	projects: Schema.Array(ProjectEntry),
	scanRoot: Schema.String
}) {}

export class BranchesSnapshot extends Schema.Class<BranchesSnapshot>('BranchesSnapshot')({
	branches: Schema.Array(GitBranch),
	defaultBranch: Schema.String
}) {}

export class ReviewSnapshot extends Schema.Class<ReviewSnapshot>('ReviewSnapshot')({
	cwd: Schema.String,
	scope: GitDiffScope,
	diffs: Schema.Array(GitDiff)
}) {}

export class RpcContracts extends RpcGroup.make(
	Rpc.make('projects.watch', {
		stream: true,
		success: ProjectsSnapshot
	}),
	Rpc.make('projects.branches', {
		payload: Schema.Struct({cwd: Schema.String}),
		success: BranchesSnapshot
	}),
	Rpc.make('projects.refresh', {}),
	Rpc.make('review.watch', {
		stream: true,
		payload: Schema.Struct({
			cwd: Schema.String,
			scope: GitDiffScope
		}),
		success: ReviewSnapshot
	}),
	Rpc.make('review.stageFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		})
	}),
	Rpc.make('review.unstageFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		})
	}),
	Rpc.make('review.discardFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		})
	}),
	Rpc.make('files.search', {
		payload: Schema.Struct({cwd: Schema.String}),
		success: Schema.Array(Schema.String)
	}),
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({
			agentId: Schema.NonEmptyString,
			cwd: Schema.String,
			model: ModelId,
			prompt: Schema.NonEmptyString,
			provider: ProviderId,
			runId: Schema.NonEmptyString
		})
	}),
	Rpc.make('agent.events', {
		stream: true,
		payload: Schema.Struct({
			agentId: Schema.NonEmptyString
		}),
		success: AgentEvent
	}),
	Rpc.make('projects.createWorktree', {
		payload: Schema.Struct({
			baseBranch: Schema.String,
			branch: Schema.String,
			cwd: Schema.String,
			mode: Schema.Literals(['existing-local', 'existing-remote', 'new-local'])
		})
	}),
	Rpc.make('projects.deleteWorktree', {
		payload: Schema.Struct({
			cwd: Schema.String,
			force: Schema.Boolean
		})
	})
) {}
