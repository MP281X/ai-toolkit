import {NodeServices} from '@effect/platform-node'

import {Effect, Layer, Stream, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {ChildProcess} from 'effect/unstable/process'
import {RpcTest} from 'effect/unstable/rpc'
import {describe, expect, it} from 'vite-plus/test'

import {RpcHandlers} from './handlers.ts'

import {RpcContracts} from '#rpcs/contracts.ts'
import {AgentCommandProfile} from '@deslop/ai/schema'
import {AgentCommand} from '@deslop/ai/service'
import {GitBranchesSnapshot, GitProject, GitRepository, GitWorktree} from '@deslop/git/schema'
import {GitWorkspace} from '@deslop/git/service'
import {PortlessOrigin, PortlessScript} from '@deslop/portless/schema'
import {Portless} from '@deslop/portless/service'
import {Usage} from '@deslop/usage/service'

const cwd = '/tmp/deslop-workbench-test'

const project = new GitProject({
	repository: new GitRepository({gitDirectory: `${cwd}/.git`, root: cwd}),
	worktrees: [new GitWorktree({branch: 'main', root: cwd})]
})

const branchSnapshot = new GitBranchesSnapshot({branches: [{name: 'main', type: 'local'}], defaultBranch: 'main'})

function runFor(
	runCwd: string,
	preparedCommand = ChildProcess.make('vp', ['run', '@deslop/app#dev'], {cwd: runCwd}),
	sessionId = '@deslop/app#dev'
) {
	return {
		origin: new PortlessOrigin({
			host: 'app.test.localhost',
			origin: 'http://app.test.localhost',
			port: 5173,
			sessionId,
			taskId: sessionId
		}),
		preparedCommand,
		script: new PortlessScript({
			command: 'vp dev',
			cwd: runCwd,
			env: {PORTLESS_URL: 'http://app.test.localhost'},
			packageName: '@deslop/app',
			portless: true,
			scriptName: 'dev',
			sessionId,
			taskId: sessionId
		}),
		status: {state: 'prepared' as const}
	}
}

const profile = new AgentCommandProfile({icon: 'codex', id: 'codex-gpt-5.5-low', label: 'codex'})

function testLayer(
	input: {
		readonly cleared?: string[]
		readonly cleanups?: string[]
		readonly deleted?: string[]
		readonly removed?: string[]
		readonly scripts?: (cwd: string) => Effect.Effect<ReturnType<typeof runFor>[]>
	} = {}
) {
	return pipe(
		RpcHandlers,
		Layer.provide(
			GitWorkspace.layerMock({
				branches: () => Effect.succeed(branchSnapshot),
				deleteWorktree: payload =>
					Effect.sync(() => {
						input.deleted?.push(payload.cwd)
					}),
				fix: (cleanupCwd: string) =>
					Effect.sync(() => {
						input.cleanups?.push(cleanupCwd)
					}),
				projects: [project]
			})
		),
		Layer.provide(
			Portless.layerMock({
				clear: clearCwd =>
					Effect.sync(() => {
						input.cleared?.push(clearCwd)
					}),
				remove: payload =>
					Effect.sync(() => {
						input.removed?.push(`${payload.cwd}:${payload.sessionId}`)
					}),
				scripts: scriptsCwd =>
					input.scripts === undefined ? Effect.succeed([runFor(scriptsCwd)]) : input.scripts(scriptsCwd)
			})
		),
		Layer.provide(
			AgentCommand.layerMock({
				command: commandInput =>
					Effect.succeed(ChildProcess.make('mock-agent', [commandInput.profileId], {cwd: commandInput.cwd})),
				profiles: [profile]
			})
		),
		Layer.provide(Usage.layer),
		Layer.provide(FetchHttpClient.layer),
		Layer.provide(NodeServices.layer)
	)
}

function makeClient(
	input: {
		readonly cleared?: string[]
		readonly cleanups?: string[]
		readonly deleted?: string[]
		readonly removed?: string[]
	} = {}
) {
	return pipe(RpcTest.makeClient(RpcContracts), Effect.provide(testLayer(input)))
}

describe('@deslop/workbench RPC handlers', () => {
	it('composes package mocks through the app-owned RPC layer', async () => {
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const client = yield* makeClient()

					return yield* Effect.all({
						branches: client['projects.branches']({cwd}),
						created: client['projects.createWorktree']({branch: 'feat/smoke-test', cwd, source: {_tag: 'new'}}),
						profiles: client['agents.profiles']()
					})
				})
			)
		)

		expect(result.branches.defaultBranch).toBe('main')
		expect(result.created).toBe(`${cwd}/.deslop-mock/feat-smoke-test`)
		expect(result.profiles).toEqual([profile])
	})

	it('clears preview routes before deleting a worktree', async () => {
		const cleared: string[] = []
		const deleted: string[] = []

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const client = yield* makeClient({cleared, deleted})
					yield* client['projects.deleteWorktree']({cwd})
				})
			)
		)

		expect(cleared).toEqual([cwd])
		expect(deleted).toEqual([cwd])
	})

	it('routes project fix through GitWorkspace', async () => {
		const cleanups: string[] = []

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const client = yield* makeClient({cleanups})
					yield* client['projects.fix']({cwd})
				})
			)
		)

		expect(cleanups).toEqual([cwd])
	})

	it('observes unknown terminal status without resolving or creating the terminal session', async () => {
		const scriptLookups: string[] = []
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const client = yield* pipe(
						RpcTest.makeClient(RpcContracts),
						Effect.provide(
							testLayer({
								scripts: scriptsCwd =>
									Effect.sync(() => {
										scriptLookups.push(scriptsCwd)
										return [runFor(scriptsCwd)]
									})
							})
						)
					)

					return yield* pipe(
						client['terminal.status']({cwd, sessionId: '@deslop/app#dev'}),
						Stream.take(1),
						Stream.runCollect
					)
				})
			)
		)

		expect([...result]).toEqual([{state: 'idle', title: ''}])
		expect(scriptLookups).toEqual([])
	})
})
