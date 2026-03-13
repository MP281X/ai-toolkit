import {Schema} from 'effect'

import {GitDiff, GitError} from '@ai-toolkit/git/schema'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class RpcContracts extends RpcGroup.make(
	Rpc.make('git.stagedDiffs', {
		stream: true,
		success: Schema.Array(GitDiff),
		error: GitError
	}),
	Rpc.make('git.unstagedDiffs', {
		stream: true,
		success: Schema.Array(GitDiff),
		error: GitError
	}),
	Rpc.make('git.stageFile', {
		payload: Schema.Struct({filePath: Schema.String}),
		error: GitError
	}),
	Rpc.make('git.unstageFile', {
		payload: Schema.Struct({filePath: Schema.String}),
		error: GitError
	}),
	Rpc.make('git.discardFile', {
		payload: Schema.Struct({filePath: Schema.String}),
		error: GitError
	}),
	Rpc.make('git.clone', {
		payload: Schema.Struct({url: Schema.String, directory: Schema.String}),
		error: GitError
	})
) {}
