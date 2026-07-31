import {Schema, pipe} from 'effect'

export const AgentId = pipe(Schema.String, Schema.brand('AgentId'))
export const BranchName = pipe(Schema.String, Schema.brand('BranchName'))
export const PlanHash = pipe(Schema.String, Schema.brand('PlanHash'))

export const Issue = Schema.Struct({agentId: AgentId, planIterations: Schema.Array(Schema.String)})

export const Implementation = Schema.Struct({agentId: AgentId, planHash: PlanHash})

export const HistoricalIssue = Schema.Struct({planIterations: Schema.Array(Schema.String)})

export const ArchivedIssue = Schema.Struct({branch: BranchName, planIterations: Schema.Array(Schema.String)})

export const IssueEntry = Schema.Struct({
	branch: BranchName,
	implementation: Schema.optional(Implementation),
	issue: Issue
})

export const PlanHandoff = Schema.Struct({
	currentHash: PlanHash,
	diff: Schema.String,
	plan: Schema.String,
	previousHash: Schema.optional(PlanHash)
})

export class IssueError extends Schema.TaggedErrorClass<IssueError>()('IssueError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}
