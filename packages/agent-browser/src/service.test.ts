import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {NodeServices} from '@effect/platform-node'

import {Effect, Predicate} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {AgentBrowser} from './service.ts'

async function tempSocketDir() {
	const dir = path.join(tmpdir(), `deslop-agent-browser-${crypto.randomUUID()}`)
	await mkdir(dir, {recursive: true})
	return dir
}

function withSocketDir<A>(socketDir: string, effect: Effect.Effect<A, unknown, AgentBrowser>) {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-access-alias -- test restores process env
	const previous = process.env['AGENT_BROWSER_SOCKET_DIR']
	process.env['AGENT_BROWSER_SOCKET_DIR'] = socketDir
	return effect.pipe(
		Effect.ensuring(
			Effect.sync(() => {
				if (Predicate.isUndefined(previous)) delete process.env['AGENT_BROWSER_SOCKET_DIR']
				else process.env['AGENT_BROWSER_SOCKET_DIR'] = previous
			})
		),
		Effect.provide(AgentBrowser.layer),
		Effect.provide(NodeServices.layer)
	)
}

describe('agent-browser sessions', () => {
	it('discovers valid stream and pid sidecars', async () => {
		const socketDir = await tempSocketDir()
		await writeFile(path.join(socketDir, 'test.stream'), '4567')
		await writeFile(path.join(socketDir, 'test.pid'), process.pid.toString())
		await writeFile(path.join(socketDir, 'test.engine'), 'chrome')
		await writeFile(path.join(socketDir, 'test.provider'), 'local')
		await writeFile(path.join(socketDir, 'test.version'), '0.29.1')
		await writeFile(path.join(socketDir, 'test.extensions'), '/tmp/ext-a,/tmp/ext-b')

		// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
		const session = await Effect.runPromise(
			withSocketDir(
				socketDir,
				Effect.gen(function* () {
					const agentBrowser = yield* AgentBrowser
					return yield* agentBrowser.session({session: 'test'})
				})
			)
		)
		expect(session.streamPort).toBe(4567)
		expect(session.pid).toBe(process.pid)
		expect(session.engine).toBe('chrome')
		expect(session.provider).toBe('local')
		expect(session.version).toBe('0.29.1')
		expect(session.extensions).toEqual(['/tmp/ext-a', '/tmp/ext-b'])
	})

	it('cleans stale pid sidecars', async () => {
		const socketDir = await tempSocketDir()
		await writeFile(path.join(socketDir, 'stale.stream'), '4567')
		await writeFile(path.join(socketDir, 'stale.pid'), '99999999')

		await expect(
			// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
			Effect.runPromise(
				withSocketDir(
					socketDir,
					Effect.gen(function* () {
						const agentBrowser = yield* AgentBrowser
						return yield* agentBrowser.session({session: 'stale'})
					})
				)
			)
		).rejects.toThrow(/Stale agent-browser session/u)
		await expect(readFile(path.join(socketDir, 'stale.stream'), 'utf8')).rejects.toThrow()
		await expect(readFile(path.join(socketDir, 'stale.pid'), 'utf8')).rejects.toThrow()
	})

	it('rejects invalid session names', async () => {
		await expect(
			// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
			Effect.runPromise(
				withSocketDir(
					await tempSocketDir(),
					Effect.gen(function* () {
						const agentBrowser = yield* AgentBrowser
						return yield* agentBrowser.session({session: '../bad'})
					})
				)
			)
		).rejects.toThrow(/Invalid agent-browser session/u)
	})
})
