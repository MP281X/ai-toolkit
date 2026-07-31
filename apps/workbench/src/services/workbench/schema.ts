import {Schema} from 'effect'

import {Prompt} from 'effect/unstable/ai'

import {EligibleSubagentSkill} from '../../eligible-subagent-skills.gen.ts'

import {AgentId, BranchName} from '#services/issues/schema.ts'
import {ProcessSnapshot} from '#services/processes/schema.ts'
import {RepositoryName} from '#services/repositories/schema.ts'
import {AgentStatus} from '@deslop/agent/schema'
import {GitFileChange, PullRequest, SourceRepository} from '@deslop/git/schema'

const IssueLifecycle = Schema.Literals(['Planned', 'Needs update', 'Running', 'Unpublished', 'Implemented'] as const)

export const PlanningConversation = Schema.Struct({agentId: AgentId, repository: RepositoryName, title: Schema.String})

export const ActiveIssue = Schema.Struct({
	branch: BranchName,
	implementationAgentId: Schema.optional(AgentId),
	lifecycle: IssueLifecycle,
	plan: Schema.String,
	planIterations: Schema.Finite,
	planningAgentId: AgentId,
	pullRequest: Schema.optional(PullRequest),
	repository: RepositoryName
})

const ActiveSubagent = Schema.Struct({
	agentId: AgentId,
	parentAgentId: AgentId,
	skill: Schema.optional(EligibleSubagentSkill),
	task: Schema.String
})

export const Conversation = Schema.Struct({history: Schema.Array(Prompt.Message), id: AgentId, status: AgentStatus})

export const IssueInspector = Schema.Struct({
	activeSubagents: Schema.Array(ActiveSubagent),
	branch: BranchName,
	changes: Schema.Array(GitFileChange),
	processes: Schema.Array(ProcessSnapshot),
	pullRequest: Schema.optional(PullRequest),
	sources: Schema.Array(SourceRepository),
	worktree: Schema.optional(Schema.String)
})

export class WorkbenchError extends Schema.TaggedErrorClass<WorkbenchError>()('WorkbenchError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
