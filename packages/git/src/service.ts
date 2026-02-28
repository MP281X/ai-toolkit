import {join} from 'node:path'

import {Array, Effect, FileSystem, flow, Layer, pipe, ServiceMap, String} from 'effect'

import * as Command from 'effect/unstable/process/ChildProcess'

import {GitDiff, GitError} from './schema.ts'

export class Git extends ServiceMap.Service<Git>()('@ai-toolkit/git/Git', {
	make: Effect.gen(function* () {
		const use = flow(
			(...args: readonly string[]) => Command.make('git', args).pipe(Command.string),
			Effect.mapError(cause => new GitError({cause})),
			Effect.map(String.split('\n')),
			Effect.map(Array.filter(String.isNonEmpty))
		)

		const fs = yield* FileSystem.FileSystem

		const repoRoot = pipe(
			use('rev-parse', '--show-toplevel'),
			Effect.map(lines => lines[0] ?? process.cwd())
		)

		return {
			stagedDiffs: pipe(
				use('diff', '--cached', '--name-only'),
				Effect.flatMap(
					Effect.forEach(filePath =>
						pipe(
							use('diff', '--cached', '--', `:/${filePath}`),
							Effect.map(lines => lines.join('\n')),
							Effect.filterOrFail(String.isNonEmpty, () => new GitError({message: `empty diff for ${filePath}`})),
							Effect.flatMap(patch =>
								pipe(
									use('show', `HEAD:${filePath}`),
									Effect.map(lines => lines.join('\n')),
									Effect.flatMap(old =>
										pipe(
											use('show', `:${filePath}`),
											Effect.map(lines => lines.join('\n')),
											Effect.map(next => new GitDiff({filePath, patch, old, new: next}))
										)
									)
								)
							)
						)
					)
				)
			),
			unstagedDiffs: pipe(
				repoRoot,
				Effect.flatMap(root =>
					pipe(
						use('diff', '--name-only'),
						Effect.flatMap(
							Effect.forEach(filePath =>
								pipe(
									use('diff', '--', `:/${filePath}`),
									Effect.map(lines => lines.join('\n')),
									Effect.filterOrFail(String.isNonEmpty, () => new GitError({message: `empty diff for ${filePath}`})),
									Effect.flatMap(patch =>
										pipe(
											use('show', `HEAD:${filePath}`),
											Effect.map(lines => lines.join('\n')),
											Effect.flatMap(old =>
												pipe(
													fs.readFileString(join(root, filePath)),
													Effect.mapError(cause => new GitError({cause})),
													Effect.map(next => new GitDiff({filePath, patch, old, new: next}))
												)
											)
										)
									)
								)
							)
						)
					)
				)
			),
			stageFile: (filePath: string) => use('add', '--', filePath).pipe(Effect.asVoid),
			unstageFile: (filePath: string) => use('reset', 'HEAD', '--', filePath).pipe(Effect.asVoid),
			discardFile: (filePath: string) => use('checkout', '--', filePath).pipe(Effect.asVoid)
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
