import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError, type AgentLayerConfig} from '#schema'

const opencodeCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make('vpx', ['opencode-ai@latest', '--auto', '--model', 'openai/gpt-5.6-sol'], {
		cwd: config.cwd,
		env: {PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'},
		extendEnv: true
	})
	if (String.isEmpty(command.command)) return yield* AgentError.make({message: 'opencode command unavailable'})
	return command
})

export const makeLayerOpencode = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: opencodeCreate(config)}
})
