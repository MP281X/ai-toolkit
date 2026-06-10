import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {createServer, request as httpRequest} from 'node:http'
import {connect} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {Duplex} from 'node:stream'

import {NodeHttpServer} from '@effect/platform-node'

import {Context, Effect, Layer, pipe} from 'effect'

import {HttpRouter, HttpServerResponse} from 'effect/unstable/http'
import {ChildProcess} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import {PortlessOrigin, type PortlessPreparedRun, PortlessRun, PortlessScript} from './schema.ts'
import {Portless} from './service.ts'

function git(cwd: string, args: readonly string[]) {
	return execFileSync('git', [...args], {cwd, encoding: 'utf8'})
}

function initRepo(root: string, scripts: Readonly<Record<string, string>>) {
	mkdirSync(root, {recursive: true})
	git(root, ['init', '--initial-branch=main'])
	git(root, ['config', 'user.email', 'test@example.com'])
	git(root, ['config', 'user.name', 'Test User'])
	writeFileSync(join(root, 'package.json'), JSON.stringify({scripts}, undefined, 2))
	git(root, ['add', 'package.json'])
	git(root, ['commit', '-m', 'initial'])
}

function writePackage(root: string, scripts: Readonly<Record<string, string>>) {
	writeFileSync(join(root, 'package.json'), JSON.stringify({scripts}, undefined, 2))
}

function withTempRoot<T>(test: (root: string) => Promise<T> | T) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const root = yield* Effect.acquireRelease(
					Effect.promise(() => mkdtemp(join(tmpdir(), 'deslop-portless-service-'))),
					directory => Effect.promise(() => rm(directory, {force: true, recursive: true}))
				)

				return yield* Effect.promise(() => Promise.resolve(test(root)))
			})
		)
	)
}

async function withUpstream<T>(port: number, body: string, test: () => Promise<T> | T) {
	const server = createServer((_request, response) => {
		response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
		response.end(body)
	})

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, '127.0.0.1', resolve)
	})

	try {
		return await test()
	} finally {
		await new Promise<void>(resolve => {
			server.close(() => {
				resolve()
			})
		})
	}
}

function webSocketAccept(key: string) {
	return createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
}

function webSocketTextFrame(message: string, masked: boolean) {
	const body = Buffer.from(message)
	const headerLength = body.length < 126 ? 2 : 4
	const maskLength = masked ? 4 : 0
	const frame = Buffer.alloc(headerLength + maskLength + body.length)
	frame[0] = 0x81
	if (body.length < 126) {
		frame[1] = body.length | (masked ? 0x80 : 0)
	} else {
		frame[1] = 126 | (masked ? 0x80 : 0)
		frame.writeUInt16BE(body.length, 2)
	}
	const payloadOffset = headerLength + maskLength
	if (masked) {
		const mask = Buffer.from([1, 2, 3, 4])
		mask.copy(frame, headerLength)
		for (let index = 0; index < body.length; index += 1) {
			frame[payloadOffset + index] = body[index] ^ mask[index % mask.length]
		}
		return frame
	}
	body.copy(frame, payloadOffset)
	return frame
}

function readWebSocketTextFrame(frame: Buffer | string) {
	const source = typeof frame === 'string' ? Buffer.from(frame, 'latin1') : frame
	const length = source[1] & 0x7f
	const masked = (source[1] & 0x80) !== 0
	const lengthOffset = length === 126 ? 4 : 2
	const payloadLength = length === 126 ? source.readUInt16BE(2) : length
	const mask = masked ? source.subarray(lengthOffset, lengthOffset + 4) : undefined
	const payloadOffset = lengthOffset + (masked ? 4 : 0)
	const payload = Buffer.alloc(payloadLength)
	for (let index = 0; index < payloadLength; index += 1) {
		payload[index] = source[payloadOffset + index] ^ (mask?.[index % 4] ?? 0)
	}
	return payload.toString('utf8')
}

async function withWebSocketUpstream<T>(port: number, test: () => Promise<T> | T) {
	const server = createServer()
	const sockets = new Set<Duplex>()
	server.on('upgrade', (request, socket) => {
		sockets.add(socket)
		socket.once('close', () => {
			sockets.delete(socket)
		})
		const key = request.headers['sec-websocket-key']
		if (typeof key !== 'string') {
			socket.destroy()
			return
		}
		const protocols = request.headers['sec-websocket-protocol'] ?? ''
		const protocol = protocols
			.split(',')
			.map(value => value.trim())
			.find(value => value === 'portless-test')
		socket.write(
			[
				'HTTP/1.1 101 Switching Protocols',
				'Upgrade: websocket',
				'Connection: Upgrade',
				`Sec-WebSocket-Accept: ${webSocketAccept(key)}`,
				...(protocol === undefined ? [] : [`Sec-WebSocket-Protocol: ${protocol}`]),
				'\r\n'
			].join('\r\n')
		)
		socket.on('data', (frame: Buffer) => {
			socket.write(webSocketTextFrame(`echo:${readWebSocketTextFrame(frame)}:${request.url}:${protocol ?? ''}`, false))
		})
	})

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, '127.0.0.1', resolve)
	})

	try {
		return await test()
	} finally {
		for (const socket of sockets) socket.destroy()
		await new Promise<void>(resolve => {
			server.close(() => {
				resolve()
			})
		})
	}
}

async function requestThrough(origin: string, host: string, path = '/') {
	const url = new URL(path, origin)

	return await new Promise<{readonly body: string; readonly status: number | undefined}>((resolve, reject) => {
		const request = httpRequest(url, {headers: {host}, method: 'GET'}, response => {
			let body = ''
			response.setEncoding('utf8')
			response.on('data', chunk => {
				body += chunk
			})
			response.on('end', () => {
				resolve({body, status: response.statusCode})
			})
		})
		request.on('error', reject)
		request.end()
	})
}

async function webSocketThrough(proxyPort: number, host: string) {
	return await new Promise<{readonly body: string; readonly protocol: string | undefined}>((resolve, reject) => {
		const socket = connect({host: '127.0.0.1', port: proxyPort})
		let handshake = ''
		let open = false
		const timeout = setTimeout(() => {
			socket.destroy()
			reject(new Error(`websocket proxy did not respond; handshake=${handshake}`))
		}, 2_000)
		function finish(result: {readonly body: string; readonly protocol: string | undefined}) {
			clearTimeout(timeout)
			resolve(result)
			socket.end()
		}
		socket.once('error', reject)
		socket.once('close', () => {
			clearTimeout(timeout)
			if (!open) reject(new Error(`websocket closed before handshake; handshake=${handshake}`))
		})
		socket.once('connect', () => {
			socket.write(
				[
					'GET /hmr?token=1 HTTP/1.1',
					`Host: ${host}:${proxyPort}`,
					'Connection: Upgrade',
					'Upgrade: websocket',
					'Sec-WebSocket-Version: 13',
					'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
					'Sec-WebSocket-Protocol: portless-test',
					'\r\n'
				].join('\r\n')
			)
		})
		socket.on('data', chunk => {
			if (!open) {
				handshake += chunk.toString('latin1')
				const boundary = handshake.indexOf('\r\n\r\n')
				if (boundary === -1) return

				open = true
				socket.write(webSocketTextFrame('hello', true))
				return
			}

			const protocol = /^sec-websocket-protocol:\s*(.+)$/imu.exec(handshake)?.[1]
			finish({body: readWebSocketTextFrame(typeof chunk === 'string' ? chunk : chunk), protocol})
		})
	})
}

async function availablePort() {
	const server = createServer()

	return await new Promise<number>((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				server.close(() => {
					reject(new Error('expected tcp address'))
				})
				return
			}
			server.close(() => {
				resolve(address.port)
			})
		})
	})
}

function liveLayer(port: number) {
	return pipe(Portless.layer, Layer.provideMerge(NodeHttpServer.layer(createServer, {port})))
}

function mockRun(): PortlessPreparedRun {
	return Object.assign(
		new PortlessRun({
			origin: new PortlessOrigin({
				host: 'dev.app.worktree.localhost',
				origin: 'http://dev.app.worktree.localhost:4100',
				port: 4100,
				sessionId: 'package.json:dev'
			}),
			script: new PortlessScript({
				command: 'vp dev',
				commandCwd: '/tmp/worktree/app',
				cwd: '/tmp/worktree',
				env: {PORTLESS_URL: 'http://dev.app.worktree.localhost:4100'},
				name: 'dev',
				origin: 'http://dev.app.worktree.localhost:4100',
				packageFolder: 'app',
				packagePath: 'package.json',
				portless: true,
				sessionId: 'package.json:dev'
			}),
			status: {state: 'prepared'}
		}),
		{preparedCommand: ChildProcess.make('vp', ['run', 'dev'], {cwd: '/tmp/worktree/app'})}
	)
}

const TestRoutes = Layer.effectDiscard(
	Effect.gen(function* () {
		const router = yield* HttpRouter.HttpRouter
		yield* router.add('*', '/*', HttpServerResponse.text('fallback'))
	})
)

const TestServer = pipe(
	Layer.mergeAll(HttpRouter.middleware(Portless.middleware, {global: true}), TestRoutes),
	HttpRouter.serve
)

describe('@deslop/portless service', () => {
	it('supports black-box preview controller mocks', async () => {
		const cleared: string[] = []
		const removed: string[] = []
		const result = await Effect.runPromise(
			pipe(
				Portless,
				Effect.flatMap(service =>
					Effect.gen(function* () {
						const runs = yield* service.scripts('/tmp/worktree')
						yield* service.remove({cwd: '/tmp/worktree', sessionId: runs[0]?.script.sessionId ?? ''})
						yield* service.clear('/tmp/worktree')
						return runs
					})
				),
				Effect.provide(
					Portless.layerMock({
						clear: cwd => Effect.sync(() => cleared.push(cwd)),
						remove: input => Effect.sync(() => removed.push(`${input.cwd}:${input.sessionId}`)),
						scripts: () => Effect.succeed([mockRun()])
					})
				)
			)
		)

		expect(result.map(run => run.origin.origin)).toEqual(['http://dev.app.worktree.localhost:4100'])
		expect(result[0]?.preparedCommand.command).toBe('vp')
		expect(result[0]?.preparedCommand.options.cwd).toBe('/tmp/worktree/app')
		expect(result[0]?.script.cwd).toBe('/tmp/worktree')
		expect(removed).toEqual(['/tmp/worktree:package.json:dev'])
		expect(cleared).toEqual(['/tmp/worktree'])
	})

	it('proxies discovered preview routes, injects browser helpers, and removes closed service routes', async () => {
		await withTempRoot(async root => {
			initRepo(root, {dev: 'vp dev'})
			const proxyPort = await availablePort()

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const context = yield* Layer.buildWithScope(liveLayer(proxyPort), yield* Effect.scope)
						yield* pipe(Layer.launch(TestServer), Effect.provide(context), Effect.forkScoped)
						const portless = Context.get(context, Portless)
						const runs = yield* portless.scripts(root)
						const run = runs[0]

						const origin = `http://127.0.0.1:${proxyPort}`
						const proxied = yield* Effect.promise(() =>
							withUpstream(run.origin.port, '<!doctype html><html><head></head><body>preview</body></html>', () =>
								requestThrough(origin, run.origin.host, '/nested/path?query=1')
							)
						)
						expect(proxied.status).toBe(200)
						expect(proxied.body).toContain('preview')
						expect(proxied.body).toContain('__deslopBrowserBridge')
						expect(proxied.body).toContain('react-scan')

						yield* portless.remove({cwd: root, sessionId: run.script.sessionId})
						const removed = yield* Effect.promise(() => requestThrough(origin, run.origin.host))
						expect(removed.status).toBe(404)
					})
				)
			)
		})
	})

	it('replaces stale preview routes when scripts are rediscovered', async () => {
		await withTempRoot(async root => {
			initRepo(root, {dev: 'vp dev', 'dev:api': 'node server.js'})
			const proxyPort = await availablePort()

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const context = yield* Layer.buildWithScope(liveLayer(proxyPort), yield* Effect.scope)
						yield* pipe(Layer.launch(TestServer), Effect.provide(context), Effect.forkScoped)
						const portless = Context.get(context, Portless)
						const first = yield* portless.scripts(root)
						const stale = first.find(run => run.script.name === 'dev')
						if (stale === undefined) throw new Error('expected stale preview run')

						writePackage(root, {'dev:api': 'node server.js'})
						const next = yield* portless.scripts(root)
						const api = next.find(run => run.script.name === 'dev:api')
						if (api === undefined) throw new Error('expected api preview run')

						const origin = `http://127.0.0.1:${proxyPort}`
						const staleResponse = yield* Effect.promise(() => requestThrough(origin, stale.origin.host))
						expect(staleResponse.status).toBe(404)

						const apiResponse = yield* Effect.promise(() =>
							withUpstream(api.origin.port, '<!doctype html><html><head></head><body>api</body></html>', () =>
								requestThrough(origin, api.origin.host)
							)
						)
						expect(apiResponse.status).toBe(200)
						expect(apiResponse.body).toContain('api')

						writePackage(root, {'dev:api': 'node server.js', 'dev:web': 'vp dev --filter web'})
						const third = yield* portless.scripts(root)
						const stableApi = third.find(run => run.script.name === 'dev:api')
						const web = third.find(run => run.script.name === 'dev:web')
						if (stableApi === undefined || web === undefined) throw new Error('expected api and web preview runs')

						expect(stableApi.origin.port).toBe(api.origin.port)
						expect(web.origin.port).toBe(stale.origin.port)
					})
				)
			)
		})
	})

	it('proxies websocket upgrades to discovered preview routes', async () => {
		await withTempRoot(async root => {
			initRepo(root, {dev: 'vp dev'})
			const proxyPort = await availablePort()

			await Effect.runPromise(
				Effect.scoped(
					Effect.gen(function* () {
						const context = yield* Layer.buildWithScope(liveLayer(proxyPort), yield* Effect.scope)
						yield* pipe(Layer.launch(TestServer), Effect.provide(context), Effect.forkScoped)
						const portless = Context.get(context, Portless)
						const runs = yield* portless.scripts(root)
						const run = runs[0]

						const proxied = yield* Effect.promise(() =>
							withWebSocketUpstream(run.origin.port, () => webSocketThrough(proxyPort, run.origin.host))
						)

						expect(proxied.protocol).toBe('portless-test')
						expect(proxied.body).toBe('echo:hello:/hmr?token=1:portless-test')
					})
				)
			)
		})
	})
})
