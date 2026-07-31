import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {Asset} from '#services/assets/schema.ts'
import {AgentId, ArchivedIssue, BranchName, PlanHandoff} from '#services/issues/schema.ts'
import {PreviewExposure} from '#services/preview/schema.ts'
import {ProcessSnapshot} from '#services/processes/schema.ts'
import {PublicationResult} from '#services/publication/schema.ts'
import {Repository, RepositoryName} from '#services/repositories/schema.ts'
import {
	ActiveIssue,
	Conversation,
	IssueInspector,
	PlanningConversation,
	WorkbenchError
} from '#services/workbench/schema.ts'
import {AgentError, AgentQuota} from '@deslop/agent/schema'
import {SourceRepository} from '@deslop/git/schema'

const RepositoryPayload = Schema.Struct({repository: RepositoryName})
const IssuePayload = Schema.Struct({branch: BranchName, repository: RepositoryName})
const AgentPayload = Schema.Struct({agentId: AgentId, repository: RepositoryName})

export class RpcContracts extends RpcGroup.make(
	Rpc.make('usage', {error: AgentError, stream: true, success: AgentQuota}),
	Rpc.make('repositories', {error: WorkbenchError, stream: true, success: Schema.Array(Repository)}),
	Rpc.make('repositories.add', {
		error: WorkbenchError,
		payload: Schema.Struct({url: Schema.URLFromString}),
		success: Repository
	}),
	Rpc.make('planning', {error: WorkbenchError, stream: true, success: Schema.Array(PlanningConversation)}),
	Rpc.make('planning.create', {
		error: WorkbenchError,
		payload: Schema.Struct({prompt: Schema.optional(Schema.String), repository: RepositoryName}),
		success: PlanningConversation
	}),
	Rpc.make('planning.prompt', {
		error: WorkbenchError,
		payload: Schema.Struct({...AgentPayload.fields, prompt: Schema.String}),
		success: Schema.Unknown
	}),
	Rpc.make('planning.save', {
		error: WorkbenchError,
		payload: Schema.Struct({...AgentPayload.fields, plan: Schema.String}),
		success: BranchName
	}),
	Rpc.make('issues', {
		error: WorkbenchError,
		payload: RepositoryPayload,
		stream: true,
		success: Schema.Array(ActiveIssue)
	}),
	Rpc.make('issues.savePlan', {
		error: WorkbenchError,
		payload: Schema.Struct({...AgentPayload.fields, branch: BranchName, plan: Schema.String}),
		success: BranchName
	}),
	Rpc.make('issues.close', {error: WorkbenchError, payload: IssuePayload}),
	Rpc.make('implementation.start', {error: WorkbenchError, payload: IssuePayload, success: AgentId}),
	Rpc.make('implementation.prompt', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, prompt: Schema.String}),
		success: Schema.Unknown
	}),
	Rpc.make('conversation', {
		error: WorkbenchError,
		payload: Schema.Struct({...AgentPayload.fields, branch: Schema.optional(BranchName)}),
		stream: true,
		success: Conversation
	}),
	Rpc.make('inspector', {error: WorkbenchError, payload: IssuePayload, stream: true, success: IssueInspector}),
	Rpc.make('publication.publish', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, base: Schema.optional(BranchName)}),
		success: PublicationResult
	})
) {}

export class AgentRpcContracts extends RpcGroup.make(
	Rpc.make('agent.assets.upload', {
		error: WorkbenchError,
		payload: Schema.Struct({bytes: Schema.Uint8ArrayFromBase64, repository: RepositoryName}),
		success: Asset
	}),
	Rpc.make('agent.issue.savePlan', {
		error: WorkbenchError,
		payload: Schema.Struct({
			agentId: AgentId,
			branch: Schema.optional(BranchName),
			plan: Schema.String,
			repository: RepositoryName
		}),
		success: BranchName
	}),
	Rpc.make('agent.issue.history', {
		error: WorkbenchError,
		payload: RepositoryPayload,
		success: Schema.Array(ArchivedIssue)
	}),
	Rpc.make('agent.issue.close', {error: WorkbenchError, payload: IssuePayload}),
	Rpc.make('agent.implementation.handoff', {error: WorkbenchError, payload: IssuePayload, success: PlanHandoff}),
	Rpc.make('agent.implementation.start', {error: WorkbenchError, payload: IssuePayload, success: AgentId}),
	Rpc.make('agent.process.start', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, script: Schema.String}),
		success: ProcessSnapshot
	}),
	Rpc.make('agent.process.stop', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, script: Schema.String})
	}),
	Rpc.make('agent.preview.expose', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, script: Schema.String}),
		success: PreviewExposure
	}),
	Rpc.make('agent.preview.revoke', {error: WorkbenchError, payload: Schema.Struct({id: Schema.String})}),
	Rpc.make('agent.publication.publish', {
		error: WorkbenchError,
		payload: Schema.Struct({...IssuePayload.fields, base: Schema.optional(BranchName)}),
		success: PublicationResult
	}),
	Rpc.make('agent.repository.alignDefault', {error: WorkbenchError, payload: IssuePayload}),
	Rpc.make('agent.source.add', {
		error: WorkbenchError,
		payload: Schema.Struct({repository: RepositoryName, url: Schema.URLFromString}),
		success: SourceRepository
	}),
	Rpc.make('agent.source.synchronize', {
		error: WorkbenchError,
		payload: Schema.Struct({name: Schema.String, repository: RepositoryName}),
		success: SourceRepository
	})
) {}
