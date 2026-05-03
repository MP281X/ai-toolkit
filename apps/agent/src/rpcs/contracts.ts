import {Schema} from 'effect'

import {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {AgentToolKit} from '@ai-toolkit/ai/tools'
import {GitBranch, GitDiff, GitDiffScope, GitRepository, GitWorktree} from '@ai-toolkit/git/schema'
import {Response} from 'effect/unstable/ai'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

const AgentStatus = Schema.Struct({
	state: Schema.Literals(['idle', 'running', 'retrying', 'stopping', 'awaiting_input', 'error']),
	updatedAt: Schema.DateTimeUtc
})

export class AgentEntry extends Schema.Class<AgentEntry>('AgentEntry')({
	agentId: Schema.NonEmptyString,
	archived: Schema.Boolean,
	firstPromptPreview: Schema.optional(Schema.String),
	layer: AgentId,
	projectRoot: Schema.String,
	status: AgentStatus,
	worktreeRoot: Schema.String
}) {}

export type AgentEvent = typeof AgentEvent.Type
export const AgentEvent = Schema.Union([
	Schema.Struct({
		prompt: Schema.NonEmptyString,
		runId: Schema.NonEmptyString,
		type: Schema.Literal('user-message')
	}),
	Schema.Struct({
		part: Response.StreamPart(AgentToolKit),
		runId: Schema.NonEmptyString,
		type: Schema.Literal('agent-part')
	})
])

export class ProjectEntry extends Schema.Class<ProjectEntry>('ProjectEntry')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}

export class BranchesSnapshot extends Schema.Class<BranchesSnapshot>('BranchesSnapshot')({
	branches: Schema.Array(GitBranch),
	defaultBranch: Schema.String
}) {}

export class RpcContracts extends RpcGroup.make(
	Rpc.make('projects.watch', {
		stream: true,
		success: Schema.Array(ProjectEntry)
	}),
	Rpc.make('projects.branches', {
		payload: Schema.Struct({cwd: Schema.String}),
		success: BranchesSnapshot
	}),
	Rpc.make('review.watch', {
		stream: true,
		payload: Schema.Struct({
			cwd: Schema.String,
			scope: GitDiffScope
		}),
		success: Schema.Array(GitDiff)
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
	Rpc.make('agents.watch', {
		stream: true,
		success: Schema.Array(AgentEntry)
	}),
	Rpc.make('agents.create', {
		payload: Schema.Struct({
			layer: AgentId,
			projectRoot: Schema.String,
			worktreeRoot: Schema.String
		}),
		success: AgentEntry
	}),
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({
			agentId: Schema.NonEmptyString,
			model: ModelId,
			prompt: Schema.NonEmptyString,
			provider: ProviderId,
			runId: Schema.NonEmptyString
		})
	}),
	Rpc.make('agent.stop', {
		payload: Schema.Struct({
			agentId: Schema.NonEmptyString
		})
	}),
	Rpc.make('agent.archive', {
		payload: Schema.Struct({
			agentId: Schema.NonEmptyString
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
		}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {
		payload: Schema.Struct({
			cwd: Schema.String,
			force: Schema.Boolean
		})
	})
) {}
