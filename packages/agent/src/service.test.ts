import {describe, expect, it} from '@effect/vitest'

import {Context, Effect, pipe} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

import {Agent} from './service.ts'

function commandFor(provider: 'claude' | 'codex' | 'opencode') {
	return Effect.runPromiseWith(Context.empty())(
		pipe(
			Effect.gen(function* () {
				const agent = yield* Agent
				return yield* agent.create
			}),
			Effect.provide(Agent.layer({cwd: '/tmp/deslop-agent', provider}))
		)
	)
}

function commandSnapshot(command: ChildProcess.StandardCommand) {
	return {args: command.args, command: command.command, cwd: command.options.cwd, env: command.options.env}
}

describe('Agent', () => {
	it('runs Codex through the latest package and executable bin', async () => {
		await expect(commandFor('codex').then(commandSnapshot)).resolves.toEqual({
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
	})

	it('runs Claude through the latest package and executable bin with install scripts enabled', async () => {
		await expect(commandFor('claude').then(commandSnapshot)).resolves.toEqual({
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
	})

	it.effect('runs OpenCode V2 interactively through its CLI package', _context =>
		pipe(
			Effect.gen(function* () {
				const agent = yield* Agent
				const command = yield* agent.create

				expect(commandSnapshot(command)).toEqual({
					args: ['@opencode-ai/cli@next'],
					command: 'vpx',
					cwd: '/tmp/deslop-agent',
					env: {PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}
				})
				expect(command.options.extendEnv).toBe(true)
			}),
			Effect.provide(Agent.layer({cwd: '/tmp/deslop-agent', provider: 'opencode'}))
		)
	)
})
