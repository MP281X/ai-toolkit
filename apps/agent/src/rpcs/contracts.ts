import {Schema} from 'effect'

import {GitRepository, GitWorktree} from '@ai-toolkit/git/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class ProjectEntry extends Schema.Class<ProjectEntry>('ProjectEntry')({
	repository: GitRepository,
	worktrees: Schema.Array(GitWorktree)
}) {}

export class ProjectsSnapshot extends Schema.Class<ProjectsSnapshot>('ProjectsSnapshot')({
	projects: Schema.Array(ProjectEntry),
	scanRoot: Schema.String
}) {}

export class RpcContracts extends RpcGroup.make(
	Rpc.make('projects.watch', {
		stream: true,
		success: ProjectsSnapshot
	}),
	Rpc.make('projects.createWorktree', {
		payload: Schema.Struct({
			baseBranch: Schema.String,
			branch: Schema.String,
			cwd: Schema.String,
			directory: Schema.String
		})
	}),
	Rpc.make('projects.deleteWorktree', {
		payload: Schema.Struct({
			cwd: Schema.String,
			force: Schema.Boolean
		})
	})
) {}
