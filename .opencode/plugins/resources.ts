import {BunServices} from '@effect/platform-bun'
import {Effect, pipe} from 'effect'

import {GitWorkspace} from '@ai-toolkit/git/service'
import type {Plugin} from '@opencode-ai/plugin'

export const plugin = (async context => {
	void Effect.runPromise(
		pipe(
			Effect.forEach(
				[
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
						name: 'legend-list',
						url: 'https://github.com/LegendApp/legend-list'
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
						name: 'typescript',
						url: 'https://github.com/microsoft/TypeScript.git'
					},
					{
						name: 'xterm.js',
						url: 'https://github.com/xtermjs/xterm.js'
					},
					{
						name: 't3code',
						url: 'https://github.com/pingdotgg/t3code'
					},
					{
						name: 'vscode',
						url: 'https://github.com/microsoft/vscode'
					}
				] as const,
				Effect.fnUntraced(function* (resource) {
					yield* GitWorkspace.use(git => {
						return git.clone({cwd: process.cwd(), directory: `.opencode/resources/${resource.name}`, url: resource.url})
					})
					yield* Effect.sync(() => {
						context.client.tui.showToast({body: {message: JSON.stringify(`cloned ${resource.name}`), variant: 'info'}})
					})
				}),
				{concurrency: 'unbounded'}
			),
			Effect.tapDefect(message => {
				return Effect.sync(() => {
					context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}})
				})
			}),
			Effect.tapError(message => {
				return Effect.sync(() => {
					context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}})
				})
			}),
			Effect.provide(GitWorkspace.layer),
			Effect.provide(BunServices.layer)
		)
	)

	return {}
}) satisfies Plugin
