import * as Command from '@effect/platform/Command'
import {Array, Effect, flow, pipe, String} from 'effect'

import {GitDiff, GitError} from './schema.ts'

export class Git extends Effect.Service<Git>()('@ai-toolkit/git/Git', {
	accessors: true,
	effect: Effect.gen(function* () {
		const use = flow(
			(...args: readonly string[]) => Command.string(Command.make('git', ...args)),
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
							Effect.map(patch => GitDiff.make({filePath, patch}, true))
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
							Effect.map(patch => GitDiff.make({filePath, patch}, true))
						)
					)
				)
			)
		}
	})
}) {}
