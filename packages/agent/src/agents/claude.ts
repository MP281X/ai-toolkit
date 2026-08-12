import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError, type AgentLayerConfig} from '#schema'

const claudeCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make(
		'vpx',
		[
			'@anthropic-ai/claude-code@latest',
			'--model',
			'claude-opus-4-8',
			'--permission-mode',
			'bypassPermissions',
			'--effort',
			'high'
		],
		{cwd: config.cwd, env: {CLAUDE_CODE_NO_FLICKER: '1', PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}, extendEnv: true}
	)
	if (String.isEmpty(command.command)) return yield* AgentError.make({message: 'claude command unavailable'})
	return command
})

export const makeLayerClaude = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: claudeCreate(config)}
})
