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
	},
	{
		name: 'tanstack-hotkey',
		url: 'https://github.com/TanStack/hotkeys'
	},
	{
		name: 'pierre-diffs',
		url: 'https://github.com/pierrecomputer/pierre'
	},
	{
		name: 'lexical',
		url: 'https://github.com/facebook/lexical'
	},
	{
		name: 'opencode',
		url: 'https://github.com/anomalyco/opencode'
	}
]

export const plugin = (async context => {
	function toast(message: unknown) {
		return Effect.sync(() => context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'info'}}))
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
}) satisfies Plugin
