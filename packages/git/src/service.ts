import {dirname, join} from 'node:path'

import {Array, Effect, FileSystem, Layer, pipe, ServiceMap, Stream, String, SubscriptionRef} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {GitDiff, GitError} from './schema.ts'

export class Git extends ServiceMap.Service<Git>()('@ai-toolkit/git/Git', {
	make: Effect.gen(function* () {
		const childProcess = yield* ChildProcessSpawner.ChildProcessSpawner
		const fs = yield* FileSystem.FileSystem
		const repoRoot = yield* pipe(
			childProcess.string(ChildProcess.make('git', ['rev-parse', '--show-toplevel']), {includeStderr: true}),
			Effect.map(String.trim),
			Effect.filterOrFail(String.isNonEmpty, () => new GitError({message: 'app must start inside a git repo'})),
			Effect.mapError(cause => new GitError({cause}))
		)

		function runRepoGit(...args: readonly string[]) {
			return pipe(
				childProcess.string(ChildProcess.make('git', args, {cwd: repoRoot}), {includeStderr: true}),
				Effect.map(String.trim),
				Effect.mapError(cause => new GitError({cause}))
			)
		}

		function getDiffs(kind: 'staged' | 'unstaged') {
			return pipe(
				kind === 'staged' ? runRepoGit('diff', '--cached', '--name-only') : runRepoGit('diff', '--name-only'),
				Effect.map(output => pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))),
				Effect.flatMap(
					Effect.forEach(filePath =>
						pipe(
							kind === 'staged'
								? pipe(
										runRepoGit('show', `HEAD:${filePath}`),
										Effect.orElseSucceed(() => '')
									)
								: runRepoGit('show', `:${filePath}`),
							Effect.flatMap(old =>
								kind === 'staged'
									? pipe(
											runRepoGit('show', `:${filePath}`),
											Effect.map(next => new GitDiff({filePath, old, new: next}))
										)
									: pipe(
											fs.readFileString(join(repoRoot, filePath)),
											Effect.map(String.trim),
											Effect.mapError(cause => new GitError({cause})),
											Effect.map(next => new GitDiff({filePath, old, new: next}))
										)
							)
						)
					)
				)
			)
		}

		const stagedDiffsRef = yield* pipe(getDiffs('staged'), Effect.flatMap(SubscriptionRef.make))
		const unstagedDiffsRef = yield* pipe(getDiffs('unstaged'), Effect.flatMap(SubscriptionRef.make))

		const refreshDiffs = Effect.gen(function* () {
			yield* Effect.all(
				[
					pipe(
						getDiffs('staged'),
						Effect.flatMap(diffs => SubscriptionRef.set(stagedDiffsRef, diffs))
					),
					pipe(
						getDiffs('unstaged'),
						Effect.flatMap(diffs => SubscriptionRef.set(unstagedDiffsRef, diffs))
					)
				],
				{concurrency: 'unbounded', discard: true}
			)
		})

		yield* Effect.forkScoped(
			pipe(
				fs.watch(repoRoot),
				Stream.tap(() => refreshDiffs),
				Stream.runCollect
			)
		)

		return {
			stagedDiffs: SubscriptionRef.changes(stagedDiffsRef),
			unstagedDiffs: SubscriptionRef.changes(unstagedDiffsRef),
			stageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* runRepoGit('add', '--', filePath)
				yield* refreshDiffs
			}),
			unstageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* runRepoGit('reset', 'HEAD', '--', filePath)
				yield* refreshDiffs
			}),
			discardFile: Effect.fnUntraced(function* (filePath: string) {
				yield* runRepoGit('restore', '--worktree', '--', filePath)
				yield* refreshDiffs
			}),
			clone: Effect.fnUntraced(function* (url: string, directory: string) {
				const parent = dirname(directory)

				if (
					!(yield* pipe(
						fs.exists(parent),
						Effect.mapError(cause => new GitError({cause}))
					))
				) {
					yield* pipe(
						fs.makeDirectory(parent, {recursive: true}),
						Effect.mapError(cause => new GitError({cause}))
					)
				}

				if (
					!(yield* pipe(
						fs.exists(directory),
						Effect.mapError(cause => new GitError({cause}))
					))
				) {
					yield* pipe(
						childProcess.string(ChildProcess.make('git', ['clone', '--depth', '1', url, directory], {cwd: repoRoot}), {
							includeStderr: true
						}),
						Effect.mapError(cause => new GitError({message: `failed to clone ${url} into ${directory}`, cause})),
						Effect.asVoid
					)

					return
				}

				if (
					!(yield* pipe(
						fs.exists(join(directory, '.git')),
						Effect.mapError(cause => new GitError({cause}))
					))
				) {
					yield* new GitError({message: `${directory} is not a git repo`})
				}

				function runInDir(...args: readonly string[]) {
					return pipe(
						childProcess.string(ChildProcess.make('git', args, {cwd: directory}), {includeStderr: true}),
						Effect.map(String.trim),
						Effect.mapError(cause => new GitError({cause}))
					)
				}

				const remoteUrl = yield* runInDir('config', '--get', 'remote.origin.url')

				if (remoteUrl !== url) {
					yield* new GitError({message: `${directory} remote.origin.url does not match ${url}`})
				}

				const dirtyOutput = yield* runInDir('status', '--short')

				if (String.isNonEmpty(dirtyOutput)) {
					yield* new GitError({message: `${directory} has uncommitted changes`})
				}

				yield* pipe(
					runInDir('pull', '--ff-only', '--quiet'),
					Effect.mapError(cause => new GitError({message: `failed to update ${directory} from ${url}`, cause}))
				)
			})
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
