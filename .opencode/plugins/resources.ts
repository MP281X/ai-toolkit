import {NodeServices} from '@effect/platform-node'

import {Effect} from 'effect'

import type {Plugin} from '@opencode-ai/plugin'

import {GitWorkspace} from '@deslop/git/service'

export const plugin = (context => {
	void Effect.runPromise(
		Effect.forEach(
			[
				{name: 'effect', url: 'https://github.com/Effect-TS/effect-smol'},
				{name: 'tanstack-router', url: 'https://github.com/TanStack/router'},
				{name: 'tanstack-hotkey', url: 'https://github.com/TanStack/hotkeys'},
				{name: 'tanstack-form', url: 'https://github.com/TanStack/form'},
				{name: 'legend-list', url: 'https://github.com/LegendApp/legend-list'},
				{name: 'pierre-diffs', url: 'https://github.com/pierrecomputer/pierre'},
				{name: 'lexical', url: 'https://github.com/facebook/lexical'},
				{name: 'typescript', url: 'https://github.com/microsoft/TypeScript.git'},
				{name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js'},
				{name: 't3code', url: 'https://github.com/pingdotgg/t3code'},
				{name: 'vscode', url: 'https://github.com/microsoft/vscode'},
				{name: 'effect-lsp', url: 'https://github.com/Effect-TS/language-service'},
				{name: 'codex', url: 'https://github.com/openai/codex'},
				{name: 'opencode', url: 'https://github.com/anomalyco/opencode'},
				{name: 'react-doctor', url: 'https://github.com/millionco/react-doctor'},
				{name: 'portless', url: 'https://github.com/vercel-labs/portless'},
				{name: 'lydell-node-pty', url: 'https://github.com/lydell/node-pty'},
				{name: 'node-pty', url: 'https://github.com/microsoft/node-pty'},
				{name: 'pi', url: 'https://github.com/earendil-works/pi'},
				{name: 'localterm', url: 'https://github.com/millionco/localterm.git'}
			],
			Effect.fnUntraced(function* (resource) {
				yield* GitWorkspace.use(git =>
					git.clone({cwd: process.cwd(), directory: `.opencode/resources/${resource.name}`, url: resource.url})
				)
				yield* Effect.promise(async () => {
					await context.client.tui.showToast({
						body: {message: JSON.stringify(`cloned ${resource.name}`), variant: 'info'}
					})
				})
			}),
			{concurrency: 'unbounded'}
		).pipe(
			Effect.tapDefect(message =>
				Effect.promise(async () => {
					await context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}})
				})
			),
			Effect.tapError(message =>
				Effect.promise(async () => {
					await context.client.tui.showToast({body: {message: JSON.stringify(message), variant: 'error'}})
				})
			),
			Effect.provide(GitWorkspace.layer),
			Effect.provide(NodeServices.layer)
		)
	)

	return Effect.runPromise(Effect.succeed({}))
}) satisfies Plugin
