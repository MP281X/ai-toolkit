import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {
	AgentCommandIcon,
	AgentCommandProfile,
	AgentCommandProfileId,
	AgentCommandRequest,
	AiError
} from '@deslop/ai/schema'
import {
	GitBranchesSnapshot,
	GitDiff,
	GitError,
	GitProject,
	GitPullRequest,
	GitReviewComment,
	GitReviewMark,
	GitReviewMetadata,
	GitReviewState,
	GitReviewTarget,
	GitWorktreeSource
} from '@deslop/git/schema'
import {PortlessRun} from '@deslop/portless/schema'
import {TerminalError, TerminalFrame, TerminalInput, TerminalStatus} from '@deslop/terminal/schema'

const CwdPayloadFields = {cwd: Schema.String}
const CwdPayload = Schema.Struct(CwdPayloadFields)

const TerminalPayloadFields = {
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
}

export const TerminalPayload = Schema.Struct(TerminalPayloadFields)
export type TerminalPayload = typeof TerminalPayload.Type

export const AgentSession = Schema.Struct({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	icon: AgentCommandIcon,
	label: Schema.String,
	profileId: AgentCommandProfileId,
	state: TerminalStatus,
	uuid: Schema.String
})
export type AgentSession = typeof AgentSession.Type

export const PublishPullRequestDraft = Schema.Struct({body: Schema.String, title: Schema.String})
export type PublishPullRequestDraft = typeof PublishPullRequestDraft.Type

const PublishDraftError = Schema.Union([GitError, AiError])

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agents.create', {error: TerminalError, payload: AgentCommandRequest, success: AgentSession}),
	Rpc.make('agents.profiles', {error: AiError, success: Schema.Array(AgentCommandProfile)}),
	Rpc.make('agents.remove', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, uuid: Schema.String})}),
	Rpc.make('agents.watch', {
		error: TerminalError,
		payload: CwdPayload,
		stream: true,
		success: Schema.Array(AgentSession)
	}),
	Rpc.make('projects.watch', {error: GitError, stream: true, success: Schema.Array(GitProject)}),
	Rpc.make('projects.branches', {error: GitError, payload: CwdPayload, success: GitBranchesSnapshot}),
	Rpc.make('review.metadata', {error: GitError, payload: CwdPayload, success: GitReviewMetadata}),
	Rpc.make('review.diffs', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, target: GitReviewTarget}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.state.watch', {error: GitError, payload: CwdPayload, stream: true, success: GitReviewState}),
	Rpc.make('review.state.mark', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, marks: Schema.Array(GitReviewMark)})
	}),
	Rpc.make('review.state.unmark', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, marks: Schema.Array(GitReviewMark)})
	}),
	Rpc.make('review.comments.save', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, comment: GitReviewComment})
	}),
	Rpc.make('review.comments.resolve', {
		error: GitError,
		payload: Schema.Struct({
			...CwdPayloadFields,
			filePath: Schema.String,
			lineNumber: Schema.Number,
			side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
			threadId: Schema.optional(Schema.String)
		})
	}),
	Rpc.make('publish.approve', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, message: Schema.String}),
		success: Schema.optional(GitPullRequest)
	}),
	Rpc.make('publish.message.generate', {error: PublishDraftError, payload: CwdPayload, success: Schema.String}),
	Rpc.make('publish.pr.update', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, body: Schema.String, title: Schema.String}),
		success: Schema.optional(GitPullRequest)
	}),
	Rpc.make('publish.pr.generate', {error: PublishDraftError, payload: CwdPayload, success: PublishPullRequestDraft}),
	Rpc.make('projects.createWorktree', {
		error: GitError,
		payload: Schema.Struct({...CwdPayloadFields, branch: Schema.String, source: GitWorktreeSource}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {error: GitError, payload: CwdPayload}),
	Rpc.make('projects.cleanup', {error: GitError, payload: CwdPayload}),
	Rpc.make('runs.portless', {error: TerminalError, payload: CwdPayload, success: Schema.Array(PortlessRun)}),
	Rpc.make('terminal.write', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, data: TerminalInput})
	}),
	Rpc.make('terminal.resize', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, cols: Schema.Number, rows: Schema.Number})
	}),
	Rpc.make('terminal.restart', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.status.watch', {
		error: TerminalError,
		payload: TerminalPayload,
		stream: true,
		success: TerminalStatus
	}),
	Rpc.make('terminal.stop', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.attach', {error: TerminalError, payload: TerminalPayload, stream: true, success: TerminalFrame})
) {}
