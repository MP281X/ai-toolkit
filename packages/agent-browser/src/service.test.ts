import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {Effect} from 'effect'

import {describe, expect, it} from 'vite-plus/test'

import {agentBrowserMetadata, agentBrowserSocketDirs, validAgentBrowserSessionName} from './service.ts'

async function tempSocketDir() {
	const dir = path.join(tmpdir(), `deslop-agent-browser-${crypto.randomUUID()}`)
	await mkdir(dir, {recursive: true})
	return dir
}

describe('agent-browser session discovery', () => {
	it('discovers valid stream and pid sidecars', async () => {
		const socketDir = await tempSocketDir()
		await writeFile(path.join(socketDir, 'test.stream'), '4567')
		await writeFile(path.join(socketDir, 'test.pid'), process.pid.toString())
		await writeFile(path.join(socketDir, 'test.engine'), 'chrome')
		await writeFile(path.join(socketDir, 'test.version'), '0.29.1')

		// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
		const session = await Effect.runPromise(agentBrowserMetadata({session: 'test', socketDir}))
		expect(session.streamPort).toBe(4567)
		expect(session.pid).toBe(process.pid)
		expect(session.engine).toBe('chrome')
		expect(session.version).toBe('0.29.1')
	})

	it('cleans stale pid sidecars', async () => {
		const socketDir = await tempSocketDir()
		await writeFile(path.join(socketDir, 'stale.stream'), '4567')
		await writeFile(path.join(socketDir, 'stale.pid'), '99999999')

		await expect(
			// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
			Effect.runPromise(agentBrowserMetadata({session: 'stale', socketDir}))
		).rejects.toThrow(/Stale agent-browser session/u)
		await expect(readFile(path.join(socketDir, 'stale.stream'), 'utf8')).rejects.toThrow()
		await expect(readFile(path.join(socketDir, 'stale.pid'), 'utf8')).rejects.toThrow()
	})

	it('rejects invalid session names', () => {
		expect(validAgentBrowserSessionName('deslop-agent-123')).toBe(true)
		expect(validAgentBrowserSessionName('../bad')).toBe(false)
		expect(validAgentBrowserSessionName('bad/name')).toBe(false)
		expect(validAgentBrowserSessionName('')).toBe(false)
	})

	it('uses socket-dir precedence', () => {
		expect(
			agentBrowserSocketDirs({
				AGENT_BROWSER_SOCKET_DIR: '/tmp/ab',
				HOME: '/home/deslop',
				XDG_RUNTIME_DIR: '/run/user/501'
			})[0]
		).toBe('/tmp/ab')
	})
})
