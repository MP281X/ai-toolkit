import {Effect, Stream, SubscriptionRef, pipe} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import {AgentCommandProfile} from './schema.ts'
import {Agent, AgentCommand} from './service.ts'

const prompt = {
	messages: [Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'summarize this change'})]})],
	model: 'gpt-5.5',
	provider: 'openai-codex',
	thinkingLevel: 'low'
} as const

describe('@deslop/ai AgentCommand', () => {
	it('supports black-box SDK agent mocks', async () => {
		const result = await Effect.runPromise(
			pipe(
				Agent,
				Effect.flatMap(agent =>
					Effect.gen(function* () {
						const parts = yield* Stream.runCollect(agent.prompt(prompt))
						const history = yield* agent.history
						const status = yield* SubscriptionRef.get(agent.status)

						return {history, parts, status}
					})
				),
				Effect.provide(Agent.layerMock({response: 'commit message'}))
			)
		)

		expect(result.parts).toEqual([expect.objectContaining({delta: 'commit message', type: 'text-delta'})])
		expect(result.history).toEqual(prompt.messages)
		expect(result.status.state).toBe('idle')
	})

	it('exposes terminal coding-agent profiles owned by the ai package', async () => {
		const profiles = await Effect.runPromise(
			pipe(
				AgentCommand,
				Effect.flatMap(service => service.profiles),
				Effect.provide(AgentCommand.layer)
			)
		)

		expect(profiles.map(profile => profile.id)).toEqual([
			'opencode-gpt-5.5',
			'codex-gpt-5.5-low',
			'pi-gpt-5.5-low',
			'claude-code-opus-4.8-bypass'
		])
		expect(profiles.map(profile => profile.icon)).toEqual(['opencode', 'codex', 'pi', 'claude'])
	})

	it('builds static terminal commands for each profile and cwd', async () => {
		const commands = await Effect.runPromise(
			pipe(
				AgentCommand,
				Effect.flatMap(service =>
					Effect.all({
						claude: service.command({cwd: '/tmp/worktree', profileId: 'claude-code-opus-4.8-bypass'}),
						codex: service.command({cwd: '/tmp/worktree', profileId: 'codex-gpt-5.5-low'}),
						opencode: service.command({cwd: '/tmp/worktree', profileId: 'opencode-gpt-5.5'}),
						pi: service.command({cwd: '/tmp/worktree', profileId: 'pi-gpt-5.5-low'})
					})
				),
				Effect.provide(AgentCommand.layer)
			)
		)

		expect(commands.opencode.command).toBe('opencode')
		expect(commands.opencode.args).toEqual(['--model', 'openai/gpt-5.5'])
		expect(commands.opencode.options.env).toEqual({OPENCODE_PERMISSION: '"allow"'})
		expect(commands.opencode.options.extendEnv).toBe(true)
		expect(commands.opencode.options.cwd).toBe('/tmp/worktree')
		expect(commands.codex.command).toBe('codex')
		expect(commands.codex.args).toContain('--dangerously-bypass-approvals-and-sandbox')
		expect(commands.codex.options.cwd).toBe('/tmp/worktree')
		expect(commands.claude.command).toBe('claude')
		expect(commands.claude.args).toEqual(['--model', 'claude-opus-4-8', '--permission-mode', 'bypassPermissions'])
		expect(commands.claude.options.cwd).toBe('/tmp/worktree')
		expect(commands.pi.command).toBe('pi')
		expect(commands.pi.args).toEqual(['--provider', 'openai-codex', '--model', 'gpt-5.5:low'])
		expect(commands.pi.options.cwd).toBe('/tmp/worktree')
	})

	it('supports black-box command catalog mocks', async () => {
		const result = await Effect.runPromise(
			pipe(
				AgentCommand,
				Effect.flatMap(service =>
					Effect.all({
						command: service.command({cwd: '/tmp/mock-worktree', profileId: 'codex-gpt-5.5-low'}),
						profiles: service.profiles
					})
				),
				Effect.provide(
					AgentCommand.layerMock({
						command: input => Effect.succeed(ChildProcess.make('mock-agent', [input.profileId], {cwd: input.cwd})),
						profiles: [new AgentCommandProfile({icon: 'codex', id: 'codex-gpt-5.5-low', label: 'mock codex'})]
					})
				)
			)
		)

		expect(result.profiles.map(profile => profile.label)).toEqual(['mock codex'])
		expect(result.command.command).toBe('mock-agent')
		expect(result.command.args).toEqual(['codex-gpt-5.5-low'])
		expect(result.command.options.cwd).toBe('/tmp/mock-worktree')
	})
})
