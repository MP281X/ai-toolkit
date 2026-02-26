import {Array, Effect, flow, Layer, pipe, ServiceMap, String} from 'effect'

import * as Command from 'effect/unstable/process/ChildProcess'

import {GitDiff, GitError} from './schema.ts'

export class Git extends ServiceMap.Service<Git>()('@ai-toolkit/git/Git', {
	make: Effect.gen(function* () {
		const use = flow(
			(...args: readonly string[]) => Command.make('git', args).pipe(Command.string),
			Effect.mapError(cause => new GitError({cause}))
		)

		return {
			stagedDiffs: pipe(
				use('diff', '--cached', '--name-only'),
				Effect.map(String.split('\n')),
				Effect.map(Array.filter(String.isNonEmpty)),
				Effect.flatMap(
					Effect.forEach(filePath =>
						pipe(
							use('diff', '--cached', '--', `:/${filePath}`),
							Effect.filterOrFail(String.isNonEmpty, () => new GitError({message: `empty diff for ${filePath}`})),
							Effect.map(patch => new GitDiff({filePath, patch}))
						)
					)
				)
			),
			unstagedDiffs: pipe(
				use('diff', '--name-only'),
				Effect.map(String.split('\n')),
				Effect.map(Array.filter(String.isNonEmpty)),
				Effect.flatMap(
					Effect.forEach(filePath =>
						pipe(
							use('diff', '--', `:/${filePath}`),
							Effect.filterOrFail(String.isNonEmpty, () => new GitError({message: `empty diff for ${filePath}`})),
							Effect.map(patch => new GitDiff({filePath, patch}))
						)
					)
				)
			)
		}
	})
}) {
	static layer = Layer.effect(this, this.make)
}
