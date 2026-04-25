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
		name: 'tanstack-form',
		url: 'https://github.com/TanStack/form'
	},
	{
		name: 'tanstack-virtual',
		url: 'https://github.com/tanstack/virtual'
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
	},
	{
		name: 'exa-js',
		url: 'https://github.com/exa-labs/exa-js'
	},
	{
		name: 't3-code',
		url: 'https://github.com/pingdotgg/t3code'
	}
]

export const plugin = (async context => {
	void Effect.runPromise(
		pipe(
			Effect.forEach(
				resources,
				Effect.fnUntraced(function* (resource) {
					yield* Git.use(git => git.clone(resource.url, `.opencode/resources/${resource.name}`))
					yield* Effect.sync(() =>
						context.client.tui.showToast({body: {message: JSON.stringify(`cloned ${resource.name}`), variant: 'info'}})
					)
				}),
				{concurrency: 'unbounded'}
			),
			Effect.tapDefect(message =>
				Effect.sync(() => context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}}))
			),
			Effect.tapError(message =>
				Effect.sync(() => context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}}))
			),
			Effect.provide(Git.layer),
			Effect.provide(BunServices.layer)
		)
	)

	return {}
}) satisfies Plugin
