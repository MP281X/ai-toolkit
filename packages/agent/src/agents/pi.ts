import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError, type AgentLayerConfig} from '../schema.ts'

const piCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make(
		'vpx',
		['@earendil-works/pi-coding-agent@latest', '--model', 'openai-codex/gpt-5.5', '--thinking', 'medium', '--approve'],
		{cwd: config.cwd}
	)
	if (String.isEmpty(command.command)) return yield* new AgentError({message: 'pi command unavailable'})
	return command
})

export const makeLayerPi = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: piCreate(config)}
})
