import {Effect} from 'effect'

import {Git} from '@ai-toolkit/git/service'

import {GitContracts} from '#rpcs/git/contracts.ts'

export const GitLive = GitContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git

		return GitContracts.of({
			'git.stagedDiffs': () => git.stagedDiffs,
			'git.unstagedDiffs': () => git.unstagedDiffs
		})
	})
)
