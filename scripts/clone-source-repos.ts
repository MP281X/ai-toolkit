import {NodeRuntime, NodeServices} from '@effect/platform-node'

import {Array, Config, Effect, FileSystem, Schema, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

const repositories = [
	{name: 'base-ui', url: 'https://github.com/mui/base-ui'},
	{name: 'codex', url: 'https://github.com/openai/codex'},
	{name: 'effect', url: 'https://github.com/Effect-TS/effect'},
	{name: 'effect-tsgo', url: 'https://github.com/Effect-TS/tsgo'},
	{name: 'fallow', url: 'https://github.com/fallow-rs/fallow'},
	{name: 'legend-list', url: 'https://github.com/LegendApp/legend-list'},
	{name: 'lexical', url: 'https://github.com/facebook/lexical'},
	{name: 'localterm', url: 'https://github.com/millionco/localterm.git'},
	{name: 'lydell-node-pty', url: 'https://github.com/lydell/node-pty'},
	{name: 'node-pty', url: 'https://github.com/microsoft/node-pty'},
	{name: 'opencode', url: 'https://github.com/anomalyco/opencode'},
	{name: 'oxc', url: 'https://github.com/oxc-project/oxc'},
	{name: 'pi', url: 'https://github.com/earendil-works/pi'},
	{name: 'pierre-diffs', url: 'https://github.com/pierrecomputer/pierre'},
	{name: 'react-doctor', url: 'https://github.com/millionco/react-doctor'},
	{name: 'react', url: 'https://github.com/facebook/react'},
	{name: 'superset', url: 'https://github.com/superset-sh/superset'},
	{name: 't3code', url: 'https://github.com/pingdotgg/t3code'},
	{name: 'tanstack-form', url: 'https://github.com/TanStack/form'},
	{name: 'tanstack-hotkey', url: 'https://github.com/TanStack/hotkeys'},
	{name: 'tanstack-router', url: 'https://github.com/TanStack/router'},
	{name: 'typescript', url: 'https://github.com/microsoft/TypeScript.git'},
	{name: 'vite-plus', url: 'https://github.com/voidzero-dev/vite-plus'},
	{name: 'vscode', url: 'https://github.com/microsoft/vscode'},
	{name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js'}
] as const

class SourceRepositoryError extends Schema.TaggedError<SourceRepositoryError>()('SourceRepositoryError', {
	message: Schema.String
}) {}

const program = Effect.gen(function* () {
	const githubActions = yield* pipe(Config.boolean('GITHUB_ACTIONS'), Config.withDefault(false))

	if (githubActions) {
		yield* Effect.log('Skipping source repository clone.')
		return
	}

	const fs = yield* FileSystem.FileSystem
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const git = Effect.fnUntraced(function* (name: string, phase: string, args: string[]) {
		yield* Effect.log(`${phase} ${name}`)

		const exitCode = yield* spawner.exitCode(ChildProcess.make('git', args, {stderr: 'inherit', stdout: 'inherit'}))

		if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
			return yield* SourceRepositoryError.make({message: `git ${Array.join(' ')(args)} failed for ${name}`})
		}
	})

	yield* fs.makeDirectory('.agents/repos', {recursive: true})
	yield* Effect.forEach(
		repositories,
		Effect.fnUntraced(function* (repository) {
			const directory = `.agents/repos/${repository.name}`

			if (yield* fs.exists(directory)) {
				yield* git(repository.name, 'updating remote', ['-C', directory, 'remote', 'set-url', 'origin', repository.url])
				yield* git(repository.name, 'fetching', ['-C', directory, 'fetch', '--depth', '1', 'origin', 'HEAD'])
				yield* git(repository.name, 'resetting', ['-C', directory, 'reset', '--hard', 'FETCH_HEAD'])
			} else {
				yield* git(repository.name, 'cloning', ['clone', '--depth', '1', '--single-branch', repository.url, directory])
			}

			yield* Effect.log(`ready ${repository.name}`)
		}),
		{concurrency: 4}
	)
})

// This executable provides its complete platform layer once at the entry point.
// @effect-diagnostics-next-line strictEffectProvide:off
NodeRuntime.runMain(pipe(program, Effect.provide(NodeServices.layer)))
