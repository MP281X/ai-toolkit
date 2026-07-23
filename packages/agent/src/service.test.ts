import {describe, expect, it} from '@effect/vitest'

import {Effect, pipe} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

import {Agent} from './service.ts'

function commandSnapshot(command: ChildProcess.StandardCommand) {
	return {args: command.args, command: command.command, cwd: command.options.cwd, env: command.options.env}
}

describe('Agent', () => {
	it.effect('runs Codex through the latest package and executable bin', () =>
		pipe(
			Effect.gen(function* () {
				const agent = yield* Agent
				const command = yield* agent.create
				expect(commandSnapshot(command)).toEqual({
					args: [
						'@openai/codex@latest',
						'--model',
						'gpt-5.6-sol',
						'-c',
						'model_reasoning_effort=medium',
						'--dangerously-bypass-approvals-and-sandbox'
					],
					command: 'vpx',
					cwd: '/tmp/deslop-agent',
					env: {PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}
				})
			}),
			Effect.provide(Agent.layer({cwd: '/tmp/deslop-agent', provider: 'codex'}))
		)
	)

	it.effect('runs Claude through the latest package and executable bin with install scripts enabled', () =>
		pipe(
			Effect.gen(function* () {
				const agent = yield* Agent
				const command = yield* agent.create
				expect(commandSnapshot(command)).toEqual({
					args: [
						'@anthropic-ai/claude-code@latest',
						'--model',
						'claude-opus-4-8',
						'--permission-mode',
						'bypassPermissions',
						'--effort',
						'high'
					],
					command: 'vpx',
					cwd: '/tmp/deslop-agent',
					env: {CLAUDE_CODE_NO_FLICKER: '1', PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}
				})
			}),
			Effect.provide(Agent.layer({cwd: '/tmp/deslop-agent', provider: 'claude'}))
		)
	)
})
