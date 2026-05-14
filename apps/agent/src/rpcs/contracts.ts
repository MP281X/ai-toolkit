import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {AgentEvent, AgentKey, AgentStatus} from '@ai-toolkit/ai/schema'
import {GitBranchesSnapshot, GitDiff, GitDiffScope, GitError, GitProject} from '@ai-toolkit/git/schema'
import {TerminalError, TerminalEvent} from '@ai-toolkit/terminal/schema'

export class RpcContracts extends RpcGroup.make(
	Rpc.make('projects.watch', {
		stream: true,
		success: Schema.Array(GitProject)
	}),
	Rpc.make('projects.branches', {
		payload: Schema.Struct({cwd: Schema.String}),
		success: GitBranchesSnapshot,
		error: GitError
	}),
	Rpc.make('review.watch', {
		stream: true,
		payload: Schema.Struct({
			cwd: Schema.String,
			scope: GitDiffScope
		}),
		success: Schema.Array(GitDiff),
		error: GitError
	}),
	Rpc.make('review.stageFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		}),
		error: GitError
	}),
	Rpc.make('review.unstageFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		}),
		error: GitError
	}),
	Rpc.make('review.discardFile', {
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String
		}),
		error: GitError
	}),
	Rpc.make('agents.watch', {
		stream: true,
		success: Schema.Array(AgentKey)
	}),
	Rpc.make('agents.create', {
		payload: Schema.Struct({
			agent: AgentId,
			cwd: Schema.String
		}),
		success: AgentKey
	}),
	Rpc.make('agent.status', {
		stream: true,
		payload: Schema.Struct({
			key: AgentKey
		}),
		success: AgentStatus
	}),
	Rpc.make('agent.prompt', {
		payload: Schema.Struct({
			key: AgentKey,
			model: ModelId,
			prompt: Schema.NonEmptyString,
			provider: ProviderId
		})
	}),
	Rpc.make('agent.stop', {
		payload: Schema.Struct({
			key: AgentKey
		})
	}),
	Rpc.make('agent.delete', {
		payload: Schema.Struct({
			key: AgentKey
		})
	}),
	Rpc.make('agent.events', {
		stream: true,
		payload: Schema.Struct({
			key: AgentKey
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
		success: Schema.String,
		error: GitError
	}),
	Rpc.make('projects.deleteWorktree', {
		payload: Schema.Struct({
			cwd: Schema.String,
			force: Schema.Boolean
		}),
		error: GitError
	}),
	Rpc.make('terminal.events', {
		stream: true,
		payload: Schema.Struct({
			cwd: Schema.String
		}),
		success: TerminalEvent,
		error: TerminalError
	}),
	Rpc.make('terminal.input', {
		payload: Schema.Struct({
			data: Schema.String,
			cwd: Schema.String
		}),
		error: TerminalError
	}),
	Rpc.make('terminal.resize', {
		payload: Schema.Struct({
			cols: Schema.Number,
			cwd: Schema.String,
			rows: Schema.Number
		}),
		error: TerminalError
	})
) {}
