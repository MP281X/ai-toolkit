import {Rpc, RpcGroup} from '@effect/rpc'
import {Schema} from 'effect'

import {GitDiff, GitError} from '@ai-toolkit/git/schema'

import {AuthMiddleware} from '#rpcs/middlewares/contracts.ts'

export class GitContracts extends RpcGroup.make(
	Rpc.make('stagedDiffs', {
		success: Schema.Array(GitDiff),
		error: GitError
	}),
	Rpc.make('unstagedDiffs', {
		success: Schema.Array(GitDiff),
		error: GitError
	})
)
	.prefix('git.')
	.middleware(AuthMiddleware) {}
