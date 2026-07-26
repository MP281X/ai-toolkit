import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError} from '../schema.ts'
import type {AgentLayerConfig} from '../schema.ts'

const codexCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make(
		'vpx',
		[
			'@openai/codex@latest',
			'--model',
			'gpt-5.6-sol',
			'-c',
			'model_reasoning_effort=medium',
			'--dangerously-bypass-approvals-and-sandbox'
		],
		{cwd: config.cwd, env: {PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}, extendEnv: true}
	)
	if (String.isEmpty(command.command)) return yield* AgentError.make({message: 'codex command unavailable'})
	return command
})

export const makeLayerCodex = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: codexCreate(config)}
})
