import type {BranchName} from '#services/issues/schema.ts'
import type {RepositoryName} from '#services/repositories/schema.ts'

export type CodeModeContext = {
	readonly agent: string
	readonly issue?: typeof BranchName.Type
	readonly repository: typeof RepositoryName.Type
	readonly worktree?: string
}
