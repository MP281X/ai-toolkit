import {describe, expect, it} from '@effect/vitest'

import {Context, Effect, pipe} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

import {Agent} from './service.ts'

function commandFor(provider: 'claude' | 'codex' | 'pi') {
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
				'--package',
				'@openai/codex@latest',
				'codex',
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
				'--package',
				'@anthropic-ai/claude-code@latest',
				'claude',
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

	it('runs Pi through the latest package and executable bin', async () => {
		await expect(commandFor('pi').then(commandSnapshot)).resolves.toEqual({
			args: [
				'--package',
				'@earendil-works/pi-coding-agent@latest',
				'pi',
				'--model',
				'openai-codex/gpt-5.5',
				'--thinking',
				'medium',
				'--approve'
			],
			command: 'vpx',
			cwd: '/tmp/deslop-agent',
			env: {PNPM_CONFIG_IGNORE_SCRIPTS: 'true', PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0'}
		})
	})
})
