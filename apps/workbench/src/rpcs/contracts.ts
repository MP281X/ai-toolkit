import {Schema} from 'effect'

import {Rpc, RpcGroup} from 'effect/unstable/rpc'

import {
	GitBranchesSnapshot,
	GitDiff,
	GitDiffScope,
	GitError,
	GitProject,
	GitReviewFrom,
	GitReviewMetadata,
	GitReviewTo
} from '@ai-toolkit/git/schema'
import {TerminalError, TerminalEvent} from '@ai-toolkit/terminal/schema'

export class RpcContracts extends RpcGroup.make(
	Rpc.make('projects.watch', {stream: true, success: Schema.Array(GitProject)}),
	Rpc.make('projects.branches', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String}),
		success: GitBranchesSnapshot
	}),
	Rpc.make('review.watch', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, scope: GitDiffScope}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.metadata', {
		error: GitError,
		payload: Schema.Struct({base: Schema.optional(Schema.String), cwd: Schema.String}),
		success: GitReviewMetadata
	}),
	Rpc.make('review.watchRange', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, from: GitReviewFrom, to: GitReviewTo}),
		stream: true,
		success: Schema.Array(GitDiff)
	}),
	Rpc.make('review.createWipCommit', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, message: Schema.String})
	}),
	Rpc.make('review.commitAndPush', {
		error: GitError,
		payload: Schema.Struct({base: Schema.String, cwd: Schema.String, message: Schema.String})
	}),
	Rpc.make('review.stageFile', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, filePath: Schema.String})
	}),
	Rpc.make('review.unstageFile', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, filePath: Schema.String})
	}),
	Rpc.make('review.discardFile', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, filePath: Schema.String})
	}),
	Rpc.make('projects.createWorktree', {
		error: GitError,
		payload: Schema.Struct({
			baseBranch: Schema.String,
			branch: Schema.String,
			cwd: Schema.String,
			mode: Schema.Literals(['existing-local', 'existing-remote', 'new-local'])
		}),
		success: Schema.String
	}),
	Rpc.make('projects.deleteWorktree', {
		error: GitError,
		payload: Schema.Struct({cwd: Schema.String, force: Schema.Boolean})
	}),
	Rpc.make('terminal.events', {
		error: TerminalError,
		payload: Schema.Struct({cwd: Schema.String}),
		stream: true,
		success: TerminalEvent
	}),
	Rpc.make('terminal.input', {error: TerminalError, payload: Schema.Struct({cwd: Schema.String, data: Schema.String})}),
	Rpc.make('terminal.resize', {
		error: TerminalError,
		payload: Schema.Struct({cols: Schema.Number, cwd: Schema.String, rows: Schema.Number})
	})
) {}
