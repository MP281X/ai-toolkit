import {NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Effect, FileSystem} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

const repositories = [
	{name: 'agent-browser', url: 'https://github.com/vercel-labs/agent-browser'},
	{name: 'codex', url: 'https://github.com/openai/codex'},
	{name: 'effect', url: 'https://github.com/Effect-TS/effect-smol'},
	{name: 'effect-lsp', url: 'https://github.com/Effect-TS/language-service'},
	{name: 'legend-list', url: 'https://github.com/LegendApp/legend-list'},
	{name: 'lexical', url: 'https://github.com/facebook/lexical'},
	{name: 'localterm', url: 'https://github.com/millionco/localterm.git'},
	{name: 'lydell-node-pty', url: 'https://github.com/lydell/node-pty'},
	{name: 'node-pty', url: 'https://github.com/microsoft/node-pty'},
	{name: 'pi', url: 'https://github.com/earendil-works/pi'},
	{name: 'pierre-diffs', url: 'https://github.com/pierrecomputer/pierre'},
	{name: 'portless', url: 'https://github.com/vercel-labs/portless'},
	{name: 'react-doctor', url: 'https://github.com/millionco/react-doctor'},
	{name: 'superset', url: 'https://github.com/superset-sh/superset'},
	{name: 't3code', url: 'https://github.com/pingdotgg/t3code'},
	{name: 'tanstack-form', url: 'https://github.com/TanStack/form'},
	{name: 'tanstack-hotkey', url: 'https://github.com/TanStack/hotkeys'},
	{name: 'tanstack-router', url: 'https://github.com/TanStack/router'},
	{name: 'typescript', url: 'https://github.com/microsoft/TypeScript.git'},
	{name: 'vscode', url: 'https://github.com/microsoft/vscode'},
	{name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js'}
] as const

const program = Effect.gen(function* () {
	const githubActions = yield* Config.boolean('GITHUB_ACTIONS').pipe(Config.withDefault(false))

	if (githubActions) {
		yield* Effect.log('Skipping source repository clone.')
		return
	}

	const fs = yield* FileSystem.FileSystem
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const git = Effect.fnUntraced(function* (name: string, phase: string, args: readonly string[]) {
		yield* Effect.log(`${phase} ${name}`)

		const exitCode = yield* spawner.exitCode(ChildProcess.make('git', args, {stderr: 'inherit', stdout: 'inherit'}))

		if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
			return yield* Effect.fail(new Error(`git ${args.join(' ')} failed for ${name}`))
		}
	})

	yield* fs.makeDirectory('.agents/repos', {recursive: true})
	yield* Effect.forEach(
		repositories,
		Effect.fnUntraced(function* (repository) {
			const directory = `.agents/repos/${repository.name}`

			if (yield* fs.exists(directory)) {
				yield* git(repository.name, 'fetching', [
					'-C',
					directory,
					'fetch',
					'--progress',
					'--depth',
					'1',
					'origin',
					'HEAD'
				])
				yield* git(repository.name, 'resetting', ['-C', directory, 'reset', '--hard', 'FETCH_HEAD'])
			} else {
				yield* git(repository.name, 'cloning', [
					'clone',
					'--progress',
					'--depth',
					'1',
					'--single-branch',
					repository.url,
					directory
				])
			}

			yield* Effect.log(`ready ${repository.name}`)
		}),
		{concurrency: 4}
	)
})

NodeRuntime.runMain(program.pipe(Effect.provide(NodeServices.layer)))
