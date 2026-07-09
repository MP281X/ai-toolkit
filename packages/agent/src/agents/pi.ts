import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError, type AgentLayerConfig} from '../schema.ts'

const piCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make(
		'vpx',
		[
			'--package',
			'@earendil-works/pi-coding-agent@latest',
			'pi',
			'--model',
			'openai-codex/gpt-5.5',
			'--thinking',
			'medium',
			'--approve'
		],
		{cwd: config.cwd, env: {PNPM_CONFIG_IGNORE_SCRIPTS: 'true', PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}, extendEnv: true}
	)
	if (String.isEmpty(command.command)) return yield* new AgentError({message: 'pi command unavailable'})
	return command
})

export const makeLayerPi = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: piCreate(config)}
})
