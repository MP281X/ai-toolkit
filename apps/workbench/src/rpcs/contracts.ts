import {Hash, Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {AgentCommandIcon, AgentCommandProfile, AgentCommandProfileId, AiError} from '@deslop/ai/schema'
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
import {PortlessOrigin} from '@deslop/portless/schema'
import {TerminalError, TerminalFrame, TerminalInput, TerminalSize, TerminalStatus} from '@deslop/terminal/schema'
import {SystemUsage, UsageError, UsageProvider} from '@deslop/usage/schema'

export class CwdPayload extends Schema.Class<CwdPayload>('CwdPayload')({cwd: Schema.String}) {}

export function worktreeRouteId(root: string) {
	return Math.abs(Hash.string(root)).toString(36)
}

export class CreatedWorktree extends Schema.Class<CreatedWorktree>('CreatedWorktree')({id: Schema.String}) {}

export class TerminalShellPayload extends Schema.TaggedClass<TerminalShellPayload>()('shell', {cwd: Schema.String}) {}

export class TerminalCommandPayload extends Schema.TaggedClass<TerminalCommandPayload>()('command', {
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	sessionId: Schema.String
}) {}

export class TerminalPackageScriptPayload extends Schema.TaggedClass<TerminalPackageScriptPayload>()('package-script', {
	cwd: Schema.String,
	sessionId: Schema.String
}) {}

export class TerminalPortlessScriptPayload extends Schema.TaggedClass<TerminalPortlessScriptPayload>()(
	'portless-script',
	{cwd: Schema.String, sessionId: Schema.String}
) {}

export type TerminalPayload = typeof TerminalPayload.Type
export const TerminalPayload = Schema.Union([
	TerminalShellPayload,
	TerminalCommandPayload,
	TerminalPackageScriptPayload,
	TerminalPortlessScriptPayload
])

export class TerminalWritePayload extends Schema.Class<TerminalWritePayload>('TerminalWritePayload')({
	data: TerminalInput,
	session: TerminalPayload
}) {}

export class TerminalResizePayload extends Schema.Class<TerminalResizePayload>('TerminalResizePayload')({
	session: TerminalPayload,
	size: TerminalSize
}) {}

export class TerminalAttachPayload extends Schema.Class<TerminalAttachPayload>('TerminalAttachPayload')({
	session: TerminalPayload,
	size: TerminalSize
}) {}

export class TerminalStartPayload extends Schema.Class<TerminalStartPayload>('TerminalStartPayload')({
	session: TerminalPayload,
	size: TerminalSize
}) {}

export class AgentCreatePayload extends Schema.Class<AgentCreatePayload>('AgentCreatePayload')({
	cwd: Schema.String,
	profileId: AgentCommandProfileId,
	size: TerminalSize
}) {}

export class AgentSession extends Schema.Class<AgentSession>('AgentSession')({
	args: Schema.Array(Schema.String),
	command: Schema.String,
	cwd: Schema.String,
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	icon: AgentCommandIcon,
	label: Schema.String,
	profileId: AgentCommandProfileId,
	state: TerminalStatus,
	uuid: Schema.String
}) {}

export class ScriptRun extends Schema.Class<ScriptRun>('ScriptRun')({
	command: Schema.String,
	scriptName: Schema.String,
	sessionId: Schema.String,
	taskId: Schema.String
}) {}

export class SidebarPackageRun extends Schema.TaggedClass<SidebarPackageRun>()('package-script', {
	command: Schema.String,
	cwd: Schema.String,
	sessionId: Schema.String,
	status: TerminalStatus,
	taskId: Schema.String
}) {}

export class SidebarPortlessRun extends Schema.TaggedClass<SidebarPortlessRun>()('portless-script', {
	command: Schema.optional(Schema.String),
	cwd: Schema.String,
	origin: PortlessOrigin,
	sessionId: Schema.String,
	status: TerminalStatus,
	taskId: Schema.String
}) {}

export class SidebarWorktree extends Schema.Class<SidebarWorktree>('SidebarWorktree')({
	agents: Schema.Array(AgentSession),
	branch: Schema.optional(Schema.String),
	id: Schema.String,
	packageRuns: Schema.Array(SidebarPackageRun),
	portlessRuns: Schema.Array(SidebarPortlessRun),
	root: Schema.String
}) {}

export class SidebarProject extends Schema.Class<SidebarProject>('SidebarProject')({
	repository: GitProject.fields.repository,
	rootWorktree: SidebarWorktree,
	worktrees: Schema.Array(SidebarWorktree)
}) {}

export class HomeSidebar extends Schema.Class<HomeSidebar>('HomeSidebar')({
	agentProfiles: Schema.Array(AgentCommandProfile),
	projects: Schema.Array(SidebarProject)
}) {}

const PublishDraftError = Schema.Union([GitError, AiError])

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agents.create', {error: TerminalError, payload: AgentCreatePayload, success: AgentSession}),
	Rpc.make('agents.remove', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, uuid: Schema.String})}),
	Rpc.make('home.sidebar', {
		error: Schema.Union([GitError, TerminalError, AiError]),
		stream: true,
		success: HomeSidebar
	}),
	Rpc.make('projects.branches', {error: GitError, payload: CwdPayload, success: GitBranchesSnapshot}),
	Rpc.make('review.metadata', {error: GitError, payload: CwdPayload, stream: true, success: GitReviewMetadata}),
	Rpc.make('review.diffs', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, target: GitReviewTarget}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.fileContent', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, filePath: Schema.String, target: GitReviewTarget}),
		success: Schema.String
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
		success: CreatedWorktree
	}),
	Rpc.make('projects.deleteWorktree', {error: GitError, payload: CwdPayload}),
	Rpc.make('projects.fix', {error: GitError, payload: CwdPayload}),
	Rpc.make('terminal.write', {error: TerminalError, payload: TerminalWritePayload}),
	Rpc.make('terminal.resize', {error: TerminalError, payload: TerminalResizePayload}),
	Rpc.make('terminal.restart', {error: TerminalError, payload: TerminalStartPayload, success: TerminalStatus}),
	Rpc.make('terminal.status', {error: TerminalError, payload: TerminalPayload, stream: true, success: TerminalStatus}),
	Rpc.make('terminal.stop', {error: TerminalError, payload: TerminalPayload, success: TerminalStatus}),
	Rpc.make('terminal.attach', {
		error: TerminalError,
		payload: TerminalAttachPayload,
		stream: true,
		success: TerminalFrame
	}),
	Rpc.make('usage', {
		error: UsageError,
		payload: Schema.Struct({provider: Schema.Literals(['claude', 'codex'])}),
		stream: true,
		success: UsageProvider
	}),
	Rpc.make('usage.system', {error: UsageError, stream: true, success: SystemUsage})
) {}
