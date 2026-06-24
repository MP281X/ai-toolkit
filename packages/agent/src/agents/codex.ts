import {Effect, String} from 'effect'

import {ChildProcess} from 'effect/unstable/process'

import {AgentError, type AgentLayerConfig} from '../schema.ts'

const codexCreate = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	const command = ChildProcess.make(
		'codex',
		['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=medium', '--dangerously-bypass-approvals-and-sandbox'],
		{cwd: config.cwd}
	)
	if (String.isEmpty(command.command)) return yield* new AgentError({message: 'codex command unavailable'})
	return command
})

export const makeLayerCodex = Effect.fnUntraced(function* (config: AgentLayerConfig) {
	return {create: codexCreate(config)}
})
