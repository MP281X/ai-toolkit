import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {
	GitBranchesSnapshot,
	GitDiff,
	GitError,
	GitHubReviewThread,
	GitProject,
	GitReviewComment,
	GitReviewMark,
	GitReviewMetadata,
	GitReviewState,
	GitReviewTarget
} from '@deslop/git/schema'
import {TerminalError, TerminalState, TerminalUpdate} from '@deslop/terminal/schema'

const CreateWorktreeSource = Schema.Union([
	Schema.Struct({_tag: Schema.Literal('local')}),
	Schema.Struct({_tag: Schema.Literal('remote'), remote: Schema.String}),
	Schema.Struct({_tag: Schema.Literal('new')})
])

const TerminalPayload = Schema.Struct({
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
})

export const RunScript = Schema.Struct({
	baseOrigin: Schema.optional(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	name: Schema.String,
	origin: Schema.optional(Schema.String),
	packageFolder: Schema.String,
	packagePath: Schema.String,
	portless: Schema.optional(Schema.Boolean),
	service: Schema.optional(Schema.String),
	sessionId: Schema.String
})
export type RunScript = typeof RunScript.Type

export const AgentSession = Schema.Struct({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	icon: Schema.Literals(['opencode', 'codex', 'pi']),
	label: Schema.String,
	state: TerminalState,
	uuid: Schema.String
})
export type AgentSession = typeof AgentSession.Type

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agents.create', {
		error: TerminalError,
		payload: Schema.Struct({
			args: Schema.Array(Schema.String),
			command: Schema.String,
			cwd: Schema.String,
			icon: Schema.Literals(['opencode', 'codex', 'pi']),
			label: Schema.String
		}),
		success: AgentSession
	}),
	Rpc.make('agents.remove', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, uuid: Schema.String})}),
	Rpc.make('agents.watch', {
		error: TerminalError,
		payload: Schema.Struct({cwd: Schema.String}),
		stream: true,
		success: Schema.Array(AgentSession)
	}),
	Rpc.make('projects.watch', {stream: true, success: Schema.Array(GitProject)}),
	Rpc.make('projects.branches', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String}),
		success: GitBranchesSnapshot
	}),
	Rpc.make('review.metadata', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String}),
		success: GitReviewMetadata
	}),
	Rpc.make('review.diffs', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, filePath: Schema.optional(Schema.String), target: GitReviewTarget}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.state.watch', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String}),
		stream: true,
		success: GitReviewState
	}),
	Rpc.make('review.state.mark', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, marks: Schema.Array(GitReviewMark)})
	}),
	Rpc.make('review.state.unmark', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, marks: Schema.Array(GitReviewMark)})
	}),
	Rpc.make('review.comments.save', {
		error: GitError,
		payload: Schema.Struct({comment: GitReviewComment, cwd: Schema.String})
	}),
	Rpc.make('review.comments.resolve', {
		error: GitError,
		payload: Schema.Struct({
			cwd: Schema.String,
			filePath: Schema.String,
			lineNumber: Schema.Number,
			side: Schema.optional(Schema.Literals(['additions', 'deletions']))
		})
	}),
	Rpc.make('review.commit', {error: GitError, payload: Schema.Struct({cwd: Schema.String, message: Schema.String})}),
	Rpc.make('review.push', {error: GitError, payload: Schema.Struct({cwd: Schema.String})}),
	Rpc.make('review.githubThreads', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String}),
		success: Schema.Array(GitHubReviewThread)
	}),
	Rpc.make('review.githubThreads.resolve', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, threadId: Schema.String})
	}),
	Rpc.make('projects.createWorktree', {
		error: GitError,
		payload: Schema.Struct({branch: Schema.String, cwd: Schema.String, source: CreateWorktreeSource}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {error: GitError, payload: Schema.Struct({cwd: Schema.String})}),
	Rpc.make('runs.portless', {
		error: TerminalError,
		payload: Schema.Struct({cwd: Schema.String}),
		success: Schema.Array(RunScript)
	}),
	Rpc.make('terminal.write', {
		error: TerminalError,
		payload: Schema.Struct({
			args: Schema.optional(Schema.Array(Schema.String)),
			command: Schema.optional(Schema.String),
			cwd: Schema.String,
			data: Schema.String,
			env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
			sessionId: Schema.optional(Schema.String)
		})
	}),
	Rpc.make('terminal.resize', {
		error: TerminalError,
		payload: Schema.Struct({
			args: Schema.optional(Schema.Array(Schema.String)),
			cols: Schema.Number,
			command: Schema.optional(Schema.String),
			cwd: Schema.String,
			env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
			rows: Schema.Number,
			sessionId: Schema.optional(Schema.String)
		})
	}),
	Rpc.make('terminal.restart', {error: TerminalError, payload: TerminalPayload, success: TerminalState}),
	Rpc.make('terminal.state.watch', {
		error: TerminalError,
		payload: TerminalPayload,
		stream: true,
		success: TerminalState
	}),
	Rpc.make('terminal.stop', {error: TerminalError, payload: TerminalPayload, success: TerminalState}),
	Rpc.make('terminal.watch', {error: TerminalError, payload: TerminalPayload, stream: true, success: TerminalUpdate})
) {}
