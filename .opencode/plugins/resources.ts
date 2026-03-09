import {BunServices} from '@effect/platform-bun'
import {Effect, pipe} from 'effect'

import {Git} from '@ai-toolkit/git/service'
import type {Plugin} from '@opencode-ai/plugin'

const resources = [
	{
		name: 'effect',
		url: 'https://github.com/Effect-TS/effect-smol'
	},
	{
		name: 'tanstack-router',
		url: 'https://github.com/TanStack/router'
		// searchPath: 'packages/react-router/src'
	},
	{
		name: 'ai',
		url: 'https://github.com/vercel/ai'
		// searchPath: 'packages/ai/src'
	},
	{
		name: 'pierre-diffs',
		url: 'https://github.com/pierrecomputer/pierre'
		// searchPath: 'packages/diffs/src'
	},
	{
		name: 'lexical',
		url: 'https://github.com/facebook/lexical'
		// searchPath: 'packages'
	},
	{
		branch: 'main',
		name: 'copilot-sdk',
		url: 'https://github.com/github/copilot-sdk'
		// searchPath: 'nodejs'
	},
	{
		name: 'opencode-sdk',
		url: 'https://github.com/anomalyco/opencode'
		// searchPath: 'packages/sdk/js/src/v2'
	}
]

export const plugin: Plugin = async ({client}) => {
	function toast(message: unknown) {
		return Effect.sync(() => client.tui.showToast({body: {message: JSON.stringify(message), variant: 'info'}}))
	}

	void Effect.runPromise(
		pipe(
			Effect.forEach(
				resources,
				Effect.fnUntraced(function* (resource) {
					yield* Git.use(git => git.clone(resource.url, `.opencode/resources/${resource.name}`))
					yield* toast(`cloned ${resource.name}`)
				}),
				{concurrency: 'unbounded'}
			),
			Effect.tapDefect(toast),
			Effect.tapError(toast),
			Effect.provide(Git.layer),
			Effect.provide(BunServices.layer)
		)
	)

	return {}
}
