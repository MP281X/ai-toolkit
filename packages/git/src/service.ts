import {Context, Duration, Effect, FileSystem, Layer, pipe, Stream, String, SubscriptionRef} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {GitDiff, GitError} from './schema.ts'

export class Git extends Context.Service<Git>()('@ai-toolkit/git/service/Git', {
	make: Effect.gen(function* () {
		const execLines = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.lines)
		const execString = yield* ChildProcessSpawner.ChildProcessSpawner.useSync(spawner => spawner.string)
		const fs = yield* FileSystem.FileSystem

		const cwd = yield* pipe(
			execString(ChildProcess.make('git', ['rev-parse', '--show-toplevel'])),
			Effect.map(String.trim),
			Effect.mapError(cause => new GitError({message: 'app must start inside a git repo', cause}))
		)

		const getStagedDiffs = pipe(
			execLines(ChildProcess.make('git', ['diff', '--cached', '--name-only'], {cwd})),
			Effect.flatMap(
				Effect.forEach(
					filePath =>
						Effect.map(
							execString(
								ChildProcess.make(
									'git',
									['diff', '--cached', '--patch', '--find-renames', '-U999999', '--no-ext-diff', '--', filePath],
									{cwd}
								)
							),
							patch => new GitDiff({filePath, patch})
						),
					{concurrency: 'unbounded'}
				)
			),
			Effect.mapError(cause => new GitError({cause}))
		)
		const stagedDiffsRef = yield* Effect.andThen(getStagedDiffs, SubscriptionRef.make)

		const getUnstagedDiffs = pipe(
			execLines(ChildProcess.make('git', ['diff', '--name-only'], {cwd})),
			Effect.flatMap(
				Effect.forEach(
					filePath =>
						Effect.map(
							execString(
								ChildProcess.make(
									'git',
									['diff', '--patch', '--find-renames', '-U999999', '--no-ext-diff', '--', filePath],
									{cwd}
								)
							),
							patch => new GitDiff({filePath, patch})
						),
					{concurrency: 'unbounded'}
				)
			),
			Effect.mapError(cause => new GitError({cause}))
		)
		const unstagedDiffsRef = yield* Effect.andThen(getUnstagedDiffs, SubscriptionRef.make)

		yield* Effect.forkScoped(
			pipe(
				fs.watch(cwd),
				Stream.debounce(Duration.millis(50)),
				Stream.tap(() =>
					Effect.all(
						[
							Effect.flatMap(getStagedDiffs, diffs => SubscriptionRef.set(stagedDiffsRef, diffs)),
							Effect.flatMap(getUnstagedDiffs, diffs => SubscriptionRef.set(unstagedDiffsRef, diffs))
						],
						{concurrency: 'unbounded'}
					)
				),
				Stream.runDrain
			)
		)

		return {
			stagedDiffs: stagedDiffsRef,
			unstagedDiffs: unstagedDiffsRef,
			stageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					execString(ChildProcess.make('git', ['add', '--', filePath], {cwd})),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			unstageFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					execString(ChildProcess.make('git', ['reset', 'HEAD', '--', filePath], {cwd})),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			discardFile: Effect.fnUntraced(function* (filePath: string) {
				yield* pipe(
					execString(ChildProcess.make('git', ['restore', '--worktree', '--source=HEAD', '--', filePath], {cwd})),
					Effect.mapError(cause => new GitError({cause})),
					Effect.asVoid
				)
			}),
			clone: Effect.fnUntraced(function* (url: string, directory: string) {
				yield* pipe(fs.makeDirectory(directory, {recursive: true}), Effect.ignore)

				yield* pipe(
					execString(ChildProcess.make('git', ['clone', '--depth', '1', '--single-branch', url, directory], {cwd})),
					Effect.asVoid,
					Effect.catch(() =>
						pipe(
							execString(ChildProcess.make('git', ['-C', directory, 'pull', '--ff-only'])),
							Effect.asVoid,
							Effect.mapError(cause => new GitError({message: `failed to update ${directory} from ${url}`, cause}))
						)
					)
				)
			})
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
