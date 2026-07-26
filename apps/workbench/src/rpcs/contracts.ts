import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {AgentBrowserError, AgentBrowserTabSwitch} from '@deslop/agent-browser/schema'
import {AgentError, AgentProvider, AgentSubscription, AgentUsageData, AgentUsageProvider} from '@deslop/agent/schema'
import {AiError} from '@deslop/ai/schema'
import {
	GitBranchesSnapshot,
	GitDiff,
	GitError,
	GitProject,
	GitReviewComment,
	GitReviewCommentDraft,
	GitReviewMark,
	GitReviewMetadata,
	GitReviewState,
	GitReviewTarget,
	GitWorktreeSource
} from '@deslop/git/schema'
import {OsError, Resources} from '@deslop/os/schema'
import {PortlessRun} from '@deslop/portless/schema'
import {TerminalError, TerminalFrame, TerminalInput, TerminalStatus} from '@deslop/terminal/schema'

type CwdPayload = typeof CwdPayload.Type
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

type TerminalStatusPayload = typeof TerminalStatusPayload.Type
const TerminalStatusPayload = Schema.Struct(TerminalStatus.fields)

export type AgentSession = typeof AgentSession.Type
const AgentSession = Schema.Struct({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	icon: AgentProvider,
	label: Schema.String,
	profileId: AgentProvider,
	state: TerminalStatusPayload,
	uuid: Schema.String
})

export type AgentProfile = typeof AgentProfile.Type
const AgentProfile = Schema.Struct({icon: AgentProvider, id: AgentProvider, label: Schema.String})

export type ScriptRun = typeof ScriptRun.Type
const ScriptRun = Schema.Struct({
	command: Schema.String,
	scriptName: Schema.String,
	sessionId: Schema.String,
	taskId: Schema.String
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

type HomeSidebar = typeof HomeSidebar.Type
const HomeSidebar = Schema.Struct({agentProfiles: Schema.Array(AgentProfile), projects: Schema.Array(SidebarProject)})

type PublishDraftError = typeof PublishDraftError.Type
const PublishDraftError = Schema.Union([GitError, AiError])

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agents.create', {
		error: TerminalError,
		payload: Schema.Struct({cwd: Schema.String, provider: AgentProvider}),
		success: AgentSession
	}),
	Rpc.make('agents.profiles', {error: AgentError, success: Schema.Array(AgentProfile)}),
	Rpc.make('agents.remove', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, uuid: Schema.String})}),
	Rpc.make('agents', {error: TerminalError, payload: CwdPayload, stream: true, success: Schema.Array(AgentSession)}),
	Rpc.make('agentBrowser.sync', {error: AgentBrowserError, payload: CwdPayload}),
	Rpc.make('agentBrowser.switchTab', {error: AgentBrowserError, payload: AgentBrowserTabSwitch}),
	Rpc.make('home.sidebar', {
		error: Schema.Union([GitError, TerminalError, AiError]),
		stream: true,
		success: HomeSidebar
	}),
	Rpc.make('projects', {error: GitError, stream: true, success: Schema.Array(GitProject)}),
	Rpc.make('projects.branches', {error: GitError, payload: CwdPayload, success: GitBranchesSnapshot}),
	Rpc.make('projects.maintenance', {error: GitError, payload: CwdPayload}),
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
		payload: Schema.Struct({comment: GitReviewCommentDraft, cwd: Schema.String})
	}),
	Rpc.make('review.comments.resolve', {
		error: GitError,
		payload: Schema.Struct({comments: Schema.Array(GitReviewComment), cwd: Schema.String})
	}),
	Rpc.make('publish.checkpoint', {error: GitError, payload: CwdPayload}),
	Rpc.make('publish.publish', {error: GitError, payload: Schema.Struct({cwd: Schema.String, message: Schema.String})}),
	Rpc.make('publish.message.generate', {error: PublishDraftError, payload: CwdPayload, success: Schema.String}),
	Rpc.make('projects.createWorktree', {
		error: GitError,
		payload: Schema.Struct({branch: Schema.String, cwd: Schema.String, source: GitWorktreeSource}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {error: GitError, payload: CwdPayload}),
	Rpc.make('runs.portless', {error: TerminalError, payload: CwdPayload, success: Schema.Array(PortlessRun)}),
	Rpc.make('runs.scripts', {error: TerminalError, payload: CwdPayload, success: Schema.Array(ScriptRun)}),
	Rpc.make('terminal.write', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, data: TerminalInput})
	}),
	Rpc.make('terminal.resize', {
		error: TerminalError,
		payload: Schema.Struct({...TerminalPayloadFields, cols: Schema.Finite, rows: Schema.Finite})
	}),
	Rpc.make('terminal.restart', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.status', {error: TerminalError, payload: TerminalPayload, stream: true, success: TerminalStatus}),
	Rpc.make('terminal.stop', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.attach', {
		error: TerminalError,
		payload: Schema.Struct({
			...TerminalPayloadFields,
			cols: Schema.optional(Schema.Finite),
			rows: Schema.optional(Schema.Finite)
		}),
		stream: true,
		success: TerminalFrame
	}),
	Rpc.make('usage', {
		error: AgentError,
		payload: Schema.Struct({provider: AgentUsageProvider}),
		stream: true,
		success: AgentUsageData
	}),
	Rpc.make('usage.subscription', {
		error: AgentError,
		payload: Schema.Struct({provider: AgentUsageProvider}),
		success: AgentSubscription
	}),
	Rpc.make('usage.system', {error: OsError, stream: true, success: Resources})
) {}
