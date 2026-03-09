import {Effect, SubscriptionRef} from 'effect'

import {Git} from '@ai-toolkit/git/service'

import {GitContracts} from '#rpcs/git/contracts.ts'

export const GitLive = GitContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git

		return GitContracts.of({
			'git.stagedDiffs': () => SubscriptionRef.changes(git.stagedDiffs),
			'git.unstagedDiffs': () => SubscriptionRef.changes(git.unstagedDiffs),
			'git.stageFile': payload => git.stageFile(payload.filePath),
			'git.unstageFile': payload => git.unstageFile(payload.filePath),
			'git.discardFile': payload => git.discardFile(payload.filePath),
			'git.clone': payload => git.clone(payload.url, payload.directory)
		})
	})
)
