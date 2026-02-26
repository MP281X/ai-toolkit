import {Schema} from 'effect'

import {GitDiff, GitError} from '@ai-toolkit/git/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class GitContracts extends RpcGroup.make(
	Rpc.make('git.stagedDiffs', {
		success: Schema.Array(GitDiff),
		error: GitError
	}),
	Rpc.make('git.unstagedDiffs', {
		success: Schema.Array(GitDiff),
		error: GitError
	})
) {}
