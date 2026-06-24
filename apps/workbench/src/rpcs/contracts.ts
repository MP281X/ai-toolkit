import {Effect, Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {AgentCommandIcon, AgentCommandProfileId} from '@deslop/ai/catalog'
import {AgentCommandProfile, AgentCommandRequest, AiError} from '@deslop/ai/schema'
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
import {SystemUsage, UsageError, UsageProvider, UsageTokens} from '@deslop/usage/schema'

const CwdPayload = Schema.Struct({cwd: Schema.String})

const TerminalPayloadFields = {
	args: Schema.optional(Schema.Array(Schema.String)),
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.optional(Schema.String)
}

export type TerminalPayload = typeof TerminalPayload.Type
export const TerminalPayload = Schema.Struct(TerminalPayloadFields)

const TerminalStatusPayload = Schema.Struct(TerminalStatus.fields)

export type AgentSession = typeof AgentSession.Type
const AgentSession = Schema.Struct({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	icon: AgentCommandIcon,
	label: Schema.String,
	profileId: AgentCommandProfileId,
	state: TerminalStatusPayload,
	uuid: Schema.String
})

export type ScriptRun = typeof ScriptRun.Type
export const ScriptRun = Schema.Struct({
	command: Schema.String,
	scriptName: Schema.String,
	sessionId: Schema.String,
	taskId: Schema.String
})

export const ScriptPackageJson = Schema.Struct({
	scripts: Schema.Record(Schema.String, Schema.String).pipe(
		Schema.optional,
		Schema.withDecodingDefault(Effect.succeed({}))
	)
})

export type SidebarWorktree = typeof SidebarWorktree.Type
const SidebarWorktree = Schema.Struct({
	agents: Schema.Array(AgentSession),
	branch: Schema.optional(Schema.String),
	portlessRuns: Schema.Array(PortlessRun),
	root: Schema.String,
	runStatuses: Schema.Record(Schema.String, TerminalStatusPayload),
	scriptRuns: Schema.Array(ScriptRun)
})

export type SidebarProject = typeof SidebarProject.Type
const SidebarProject = Schema.Struct({
	repository: GitProject.fields.repository,
	worktrees: Schema.Array(SidebarWorktree)
})

const HomeSidebar = Schema.Struct({
	agentProfiles: Schema.Array(AgentCommandProfile),
	projects: Schema.Array(SidebarProject)
})

const PublishDraftError = Schema.Union([GitError, AiError])

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agents.create', {error: TerminalError, payload: AgentCommandRequest, success: AgentSession}),
	Rpc.make('agents.profiles', {error: AiError, success: Schema.Array(AgentCommandProfile)}),
	Rpc.make('agents.remove', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, uuid: Schema.String})}),
	Rpc.make('agents', {error: TerminalError, payload: CwdPayload, stream: true, success: Schema.Array(AgentSession)}),
	Rpc.make('home.sidebar', {
		error: Schema.Union([GitError, TerminalError, AiError]),
		stream: true,
		success: HomeSidebar
	}),
	Rpc.make('projects', {error: GitError, stream: true, success: Schema.Array(GitProject)}),
	Rpc.make('projects.branches', {error: GitError, payload: CwdPayload, success: GitBranchesSnapshot}),
	Rpc.make('review.metadata', {error: GitError, payload: CwdPayload, stream: true, success: GitReviewMetadata}),
	Rpc.make('review.diffs', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, target: GitReviewTarget}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.state', {error: GitError, payload: CwdPayload, stream: true, success: GitReviewState}),
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
			side: Schema.optional(Schema.Literals(['additions', 'deletions'])),
			threadId: Schema.optional(Schema.String)
		})
	}),
	Rpc.make('publish.approve', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, message: Schema.String}),
		success: Schema.optional(GitPullRequest)
	}),
	Rpc.make('publish.message.generate', {error: PublishDraftError, payload: CwdPayload, success: Schema.String}),
	Rpc.make('projects.createWorktree', {
		error: GitError,
		payload: Schema.Struct({branch: Schema.String, cwd: Schema.String, source: GitWorktreeSource}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {error: GitError, payload: CwdPayload}),
	Rpc.make('projects.fix', {error: GitError, payload: CwdPayload}),
	Rpc.make('runs.portless', {error: TerminalError, payload: CwdPayload, success: Schema.Array(PortlessRun)}),
	Rpc.make('runs.scripts', {error: TerminalError, payload: CwdPayload, success: Schema.Array(ScriptRun)}),
	Rpc.make('terminal.write', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, data: TerminalInput})
	}),
	Rpc.make('terminal.resize', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, cols: Schema.Number, rows: Schema.Number})
	}),
	Rpc.make('terminal.restart', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.status', {error: TerminalError, payload: TerminalPayload, stream: true, success: TerminalStatus}),
	Rpc.make('terminal.stop', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.attach', {
		error: TerminalError,
		payload: Schema.Struct({
			...TerminalPayloadFields,
			cols: Schema.optional(Schema.Number),
			rows: Schema.optional(Schema.Number)
		}),
		stream: true,
		success: TerminalFrame
	}),
	Rpc.make('usage', {
		error: UsageError,
		payload: Schema.Struct({provider: Schema.Literals(['claude', 'codex'])}),
		stream: true,
		success: UsageProvider
	}),
	Rpc.make('usage.system', {error: UsageError, stream: true, success: SystemUsage}),
	Rpc.make('usage.tokens', {error: UsageError, stream: true, success: UsageTokens})
) {}
