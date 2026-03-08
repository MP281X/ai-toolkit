import {dirname, join} from 'node:path'

import {Array, Duration, Effect, FileSystem, Layer, pipe, ServiceMap, Stream, String, SubscriptionRef} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {GitDiff, GitError} from './schema.ts'

export class Git extends ServiceMap.Service<Git>()('@ai-toolkit/git/Git', {
	make: Effect.gen(function* () {
		const childProcess = yield* ChildProcessSpawner.ChildProcessSpawner
		const fs = yield* FileSystem.FileSystem
		const repoRoot = yield* pipe(
			childProcess.string(ChildProcess.make('git', ['rev-parse', '--show-toplevel']), {includeStderr: true}),
			Effect.map(String.trim),
			Effect.mapError(cause => new GitError({message: 'app must start inside a git repo', cause}))
		)

		const stagedDiffsRef = yield* pipe(
			childProcess.string(ChildProcess.make('git', ['diff', '--cached', '--name-only'], {cwd: repoRoot}), {
				includeStderr: true
			}),
			Effect.map(String.trim),
			Effect.mapError(cause => new GitError({cause})),
			Effect.map(output => pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))),
			Effect.flatMap(
				Effect.forEach(filePath =>
					pipe(
						childProcess.string(ChildProcess.make('git', ['show', `HEAD:${filePath}`], {cwd: repoRoot}), {
							includeStderr: true
						}),
						Effect.map(String.trim),
						Effect.orElseSucceed(() => ''),
						Effect.flatMap(old =>
							pipe(
								childProcess.string(ChildProcess.make('git', ['show', `:${filePath}`], {cwd: repoRoot}), {
									includeStderr: true
								}),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause})),
								Effect.map(next => new GitDiff({filePath, old, new: next}))
							)
						)
					)
				)
			),
			Effect.flatMap(SubscriptionRef.make)
		)
		const unstagedDiffsRef = yield* pipe(
			childProcess.string(ChildProcess.make('git', ['diff', '--name-only'], {cwd: repoRoot}), {
				includeStderr: true
			}),
			Effect.map(String.trim),
			Effect.mapError(cause => new GitError({cause})),
			Effect.map(output => pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))),
			Effect.flatMap(
				Effect.forEach(filePath =>
					pipe(
						childProcess.string(ChildProcess.make('git', ['show', `:${filePath}`], {cwd: repoRoot}), {
							includeStderr: true
						}),
						Effect.map(String.trim),
						Effect.mapError(cause => new GitError({cause})),
						Effect.flatMap(old =>
							pipe(
								fs.readFileString(join(repoRoot, filePath)),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause})),
								Effect.map(next => new GitDiff({filePath, old, new: next}))
							)
						)
					)
				)
			),
			Effect.flatMap(SubscriptionRef.make)
		)

		yield* Effect.forkScoped(
			pipe(
				fs.watch(repoRoot),
				Stream.debounce(Duration.millis(100)),
				Stream.tap(() =>
					Effect.all(
						[
							pipe(
								childProcess.string(ChildProcess.make('git', ['diff', '--cached', '--name-only'], {cwd: repoRoot}), {
									includeStderr: true
								}),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause})),
								Effect.map(output => pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))),
								Effect.flatMap(
									Effect.forEach(filePath =>
										pipe(
											childProcess.string(ChildProcess.make('git', ['show', `HEAD:${filePath}`], {cwd: repoRoot}), {
												includeStderr: true
											}),
											Effect.map(String.trim),
											Effect.orElseSucceed(() => ''),
											Effect.flatMap(old =>
												pipe(
													childProcess.string(ChildProcess.make('git', ['show', `:${filePath}`], {cwd: repoRoot}), {
														includeStderr: true
													}),
													Effect.map(String.trim),
													Effect.mapError(cause => new GitError({cause})),
													Effect.map(next => new GitDiff({filePath, old, new: next}))
												)
											)
										)
									)
								),
								Effect.flatMap(diffs => SubscriptionRef.set(stagedDiffsRef, diffs))
							),
							pipe(
								childProcess.string(ChildProcess.make('git', ['diff', '--name-only'], {cwd: repoRoot}), {
									includeStderr: true
								}),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause})),
								Effect.map(output => pipe(output, String.split('\n'), Array.filter(String.isNonEmpty))),
								Effect.flatMap(
									Effect.forEach(filePath =>
										pipe(
											childProcess.string(ChildProcess.make('git', ['show', `:${filePath}`], {cwd: repoRoot}), {
												includeStderr: true
											}),
											Effect.map(String.trim),
											Effect.mapError(cause => new GitError({cause})),
											Effect.flatMap(old =>
												pipe(
													fs.readFileString(join(repoRoot, filePath)),
													Effect.map(String.trim),
													Effect.mapError(cause => new GitError({cause})),
													Effect.map(next => new GitDiff({filePath, old, new: next}))
												)
											)
										)
									)
								),
								Effect.flatMap(diffs => SubscriptionRef.set(unstagedDiffsRef, diffs))
							)
						],
						{concurrency: 'unbounded', discard: true}
					)
				),
				Stream.runDrain
			)
		)

		return {
			stagedDiffs: SubscriptionRef.changes(stagedDiffsRef),
			unstagedDiffs: SubscriptionRef.changes(unstagedDiffsRef),
			stageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					childProcess.string(ChildProcess.make('git', ['add', '--', filePath], {cwd: repoRoot}), {
						includeStderr: true
					}),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			unstageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					childProcess.string(ChildProcess.make('git', ['reset', 'HEAD', '--', filePath], {cwd: repoRoot}), {
						includeStderr: true
					}),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			discardFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					childProcess.string(
						ChildProcess.make('git', ['restore', '--worktree', '--source=HEAD', '--', filePath], {cwd: repoRoot}),
						{
							includeStderr: true
						}
					),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			clone: Effect.fnUntraced(function* (url: string, directory: string) {
				yield* pipe(
					fs.makeDirectory(dirname(directory), {recursive: true}),
					Effect.mapError(cause => new GitError({cause}))
				)

				const defaultBranch = yield* pipe(
					childProcess.string(ChildProcess.make('git', ['ls-remote', '--symref', url, 'HEAD'], {cwd: repoRoot}), {
						includeStderr: true
					}),
					Effect.map(String.trim),
					Effect.mapError(cause => new GitError({message: `failed to read default branch for ${url}`, cause})),
					Effect.flatMap(output =>
						pipe(
							output,
							String.split('\n'),
							Array.findFirst(line => pipe(line, String.startsWith('ref: '))),
							Effect.fromOption,
							Effect.mapError(() => new GitError({message: `failed to read default branch for ${url}`})),
							Effect.map(headLine => headLine.slice('ref: '.length)),
							Effect.flatMap(headLine =>
								pipe(
									headLine,
									String.split('\t'),
									Array.findFirst(part => pipe(part, String.startsWith('refs/heads/'))),
									Effect.fromOption,
									Effect.mapError(() => new GitError({message: `failed to read default branch for ${url}`}))
								)
							),
							Effect.map(branchLine => branchLine.slice('refs/heads/'.length)),
							Effect.filterOrFail(
								String.isNonEmpty,
								() => new GitError({message: `failed to read default branch for ${url}`})
							)
						)
					)
				)

				yield* pipe(
					childProcess.string(
						ChildProcess.make(
							'git',
							['clone', '--depth', '1', '--single-branch', '--branch', defaultBranch, url, directory],
							{cwd: repoRoot}
						),
						{
							includeStderr: true
						}
					),
					Effect.mapError(cause => new GitError({message: `failed to clone ${url} into ${directory}`, cause})),
					Effect.asVoid,
					Effect.catch(cloneError =>
						Effect.gen(function* () {
							if (
								!(yield* pipe(
									fs.exists(directory),
									Effect.mapError(cause => new GitError({cause}))
								))
							) {
								yield* cloneError
							}

							const remoteUrl = yield* pipe(
								childProcess.string(
									ChildProcess.make('git', ['config', '--get', 'remote.origin.url'], {cwd: directory}),
									{
										includeStderr: true
									}
								),
								Effect.map(String.trim),
								Effect.mapError(() => new GitError({message: `${directory} is not a git repo`}))
							)

							if (remoteUrl !== url) {
								yield* new GitError({message: `${directory} remote.origin.url does not match ${url}`})
							}

							const dirtyOutput = yield* pipe(
								childProcess.string(ChildProcess.make('git', ['status', '--short'], {cwd: directory}), {
									includeStderr: true
								}),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause}))
							)

							if (String.isNonEmpty(dirtyOutput)) {
								yield* new GitError({message: `${directory} has uncommitted changes`})
							}

							const branch = yield* pipe(
								childProcess.string(ChildProcess.make('git', ['branch', '--show-current'], {cwd: directory}), {
									includeStderr: true
								}),
								Effect.map(String.trim),
								Effect.mapError(cause => new GitError({cause}))
							)

							if (branch !== defaultBranch) {
								yield* new GitError({message: `${directory} is not on ${defaultBranch}`})
							}

							yield* pipe(
								childProcess.string(
									ChildProcess.make('git', ['pull', '--ff-only', '--depth', '1', 'origin', defaultBranch], {
										cwd: directory
									}),
									{includeStderr: true}
								),
								Effect.mapError(cause => new GitError({message: `failed to update ${directory} from ${url}`, cause})),
								Effect.asVoid
							)
						})
					)
				)
			})
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
