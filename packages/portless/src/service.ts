import {createServer} from 'node:net'

import {NodeSocket} from '@effect/platform-node'

import {Array, Context, Effect, HashMap, Layer, Number, Option, Predicate, Ref, Semaphore, String, pipe} from 'effect'

import {HttpServer, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {ChildProcess} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {PortlessOrigin} from './schema.ts'

export function portlessWorktreeId(cwd: string) {
	const segment = pipe(
		cwd,
		String.split(/[\\/]/u),
		Array.last,
		Option.getOrElse(() => cwd),
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9-]+/gu, '-'),
		String.replace(/^-+|-+$/gu, '')
	)
	return String.isEmpty(segment) ? 'app' : segment
}

function loopDetectedResponse(hops: number) {
	return pipe(
		HttpServerResponse.html(
			`<!doctype html><html><head><title>Loop Detected</title></head><body><h1>Loop Detected</h1><p>This request passed through Portless ${hops} times.</p></body></html>`
		),
		HttpServerResponse.setStatus(508, 'Loop Detected')
	)
}

const portlessInstrumentationLoader = `<script>(()=>{if(navigator.webdriver===true)return;const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;(document.head||document.documentElement||document.body).appendChild(script)});void load('https://unpkg.com/react-scan/dist/auto.global.js').then(()=>{window.reactScan?.({allowInIframe:true,_debug:'verbose'});return load('https://unpkg.com/react-grab/dist/index.global.js')}).catch(()=>{})})()</script>`

function htmlContentType(contentType: string | null | undefined) {
	return pipe(contentType ?? '', String.toLowerCase, String.includes('text/html'))
}

function rewritePortlessHtml(html: string) {
	const head = /<head\b[^>]*>/iu.exec(html)
	if (Predicate.isNotNull(head)) {
		const index = head.index + head[0].length
		return `${String.slice(0, index)(html)}${portlessInstrumentationLoader}${String.slice(index)(html)}`
	}
	return `${portlessInstrumentationLoader}${html}`
}

export function rewritePortlessHtmlResponse(input: {contentType?: string | null; html: string; method: string}) {
	if (input.method !== 'GET' || !htmlContentType(input.contentType)) return
	return rewritePortlessHtml(input.html)
}

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const hops = pipe(
		webRequest.headers.get('x-portless-hops') ?? '',
		Number.parse,
		Option.getOrElse(() => 0)
	)
	if (hops >= 5) return loopDetectedResponse(hops)

	const [pathname = '/', search = ''] = String.split(request.url, '?')
	const headers = new Headers(webRequest.headers)
	headers.set('host', new URL(origin).host)
	headers.set('x-portless-hops', `${hops + 1}`)
	const requestInit = {
		body: webRequest.body,
		duplex: 'half',
		headers,
		method: webRequest.method,
		redirect: webRequest.redirect,
		signal: webRequest.signal
	} satisfies RequestInit & {duplex: 'half'}
	const upstream = yield* Effect.tryPromise(() =>
		// Native fetch preserves the Web Request and streaming Response at the transparent proxy boundary.
		// @effect-diagnostics-next-line globalFetchInEffect:off
		fetch(new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, requestInit))
	)
	if (webRequest.method === 'GET' && htmlContentType(upstream.headers.get('content-type'))) {
		const responseHeaders = new Headers(upstream.headers)
		responseHeaders.delete('content-length')
		responseHeaders.delete('content-encoding')
		responseHeaders.set('content-type', 'text/html; charset=utf-8')
		const html = yield* Effect.tryPromise(() => upstream.text())
		const rewritten = rewritePortlessHtmlResponse({
			contentType: upstream.headers.get('content-type'),
			html,
			method: webRequest.method
		})
		return HttpServerResponse.fromWeb(
			new Response(rewritten ?? html, {
				headers: responseHeaders,
				status: upstream.status,
				statusText: upstream.statusText
			})
		)
	}
	return HttpServerResponse.fromWeb(
		new Response(upstream.body, {headers: upstream.headers, status: upstream.status, statusText: upstream.statusText})
	)
})

function webSocketBytes(message: NodeSocket.NodeWS.RawData) {
	if (message instanceof ArrayBuffer) return new Uint8Array(message)
	// The Node WebSocket boundary emits fragmented Buffer arrays.
	// oxlint-disable-next-line eslint/no-restricted-properties
	if (Array.isArray(message)) return Buffer.concat(message)
	return message
}

const proxyWebSocket = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const [pathname = '/', search = ''] = String.split(request.url, '?')
	const upstreamUrl = new URL(origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	upstreamUrl.pathname = pathname
	// URL.search is boundary data, not a prototype search operation.
	// oxlint-disable-next-line eslint/no-restricted-properties
	upstreamUrl.search = search

	const inbound = yield* request.upgrade
	const outbound = yield* Effect.acquireRelease(
		Effect.callback<NodeSocket.NodeWS.WebSocket, Socket.SocketError>(resume => {
			const socket = new NodeSocket.NodeWS.WebSocket(upstreamUrl, {
				headers: pipe(
					request.headers['cookie'],
					Option.fromUndefinedOr,
					Option.filter(String.isNonEmpty),
					Option.map(cookie => ({cookie})),
					Option.getOrUndefined
				)
			})
			function cleanup() {
				socket.off('open', onOpen)
				socket.off('error', onError)
			}
			function onOpen() {
				cleanup()
				resume(Effect.succeed(socket))
			}
			function onError(cause: unknown) {
				cleanup()
				resume(Effect.fail(Socket.SocketError.make({reason: Socket.SocketOpenError.make({cause, kind: 'Unknown'})})))
			}
			socket.once('open', onOpen)
			socket.once('error', onError)
			return Effect.sync(() => {
				cleanup()
				socket.terminate()
			})
		}),
		socket =>
			Effect.sync(() => {
				socket.terminate()
			})
	)
	const writeInbound = yield* inbound.writer
	const runFork = Effect.runForkWith(yield* Effect.context())
	const readOutbound = Effect.callback<unknown, Socket.SocketError>(resume => {
		function closeInbound(code: number, reason?: string) {
			runFork(
				pipe(
					writeInbound(new Socket.CloseEvent(code, reason)),
					Effect.match({
						onFailure: error => {
							resume(Effect.fail(error))
						},
						onSuccess: () => {
							resume(Effect.void)
						}
					})
				)
			)
		}
		function onMessage(message: NodeSocket.NodeWS.RawData, isBinary: boolean) {
			const payload = webSocketBytes(message)
			runFork(
				pipe(
					writeInbound(isBinary ? payload : new TextDecoder().decode(payload)),
					Effect.catch(error =>
						Effect.sync(() => {
							resume(Effect.fail(error))
						})
					)
				)
			)
		}
		function onError() {
			closeInbound(1011, 'upstream websocket failed')
		}
		function onClose(code: number, reason: Buffer) {
			const closeReason = reason.toString()
			closeInbound(code, String.isNonEmpty(closeReason) ? closeReason : undefined)
		}
		outbound.on('message', onMessage)
		outbound.once('error', onError)
		outbound.once('close', onClose)
		return Effect.sync(() => {
			outbound.off('message', onMessage)
			outbound.off('error', onError)
			outbound.off('close', onClose)
		})
	})
	function writeOutbound(message: string | Uint8Array) {
		return Effect.callback<unknown, Socket.SocketError>(resume => {
			outbound.send(message, cause => {
				resume(
					cause ? Effect.fail(Socket.SocketError.make({reason: Socket.SocketWriteError.make({cause})})) : Effect.void
				)
			})
		})
	}
	function closeOutbound(error?: Socket.SocketError) {
		return Effect.callback<unknown, Socket.SocketError>(resume => {
			function cleanup() {
				outbound.off('close', onClose)
				outbound.off('error', onError)
			}
			function onClose() {
				cleanup()
				resume(Effect.void)
			}
			function onError(cause: unknown) {
				cleanup()
				resume(Effect.fail(Socket.SocketError.make({reason: Socket.SocketWriteError.make({cause})})))
			}
			outbound.once('close', onClose)
			outbound.once('error', onError)
			try {
				if (error?.reason._tag === 'SocketCloseError') {
					outbound.close(error.reason.code, error.reason.closeReason)
				} else {
					outbound.close(
						Predicate.isUndefined(error) ? 1000 : 1011,
						Predicate.isUndefined(error) ? undefined : 'proxy failed'
					)
				}
			} catch (cause) {
				cleanup()
				resume(Effect.fail(Socket.SocketError.make({reason: Socket.SocketWriteError.make({cause})})))
			}
			return Effect.sync(cleanup)
		})
	}

	yield* pipe(
		Effect.raceFirst(
			readOutbound,
			pipe(
				inbound.runRaw(message => writeOutbound(Predicate.isString(message) ? message : Uint8Array.from(message))),
				Effect.matchEffect({onFailure: closeOutbound, onSuccess: () => closeOutbound()})
			)
		),
		Effect.ignore
	)

	return HttpServerResponse.empty()
})

function hostname(host: string | undefined) {
	return pipe(
		Option.fromUndefinedOr(host),
		Option.flatMap(value => pipe(value, String.split(':'), Array.head))
	)
}

const hostPortAvailable = Effect.fnUntraced(function* (host: string, port: number) {
	return yield* Effect.callback<boolean>(resume => {
		const server = createServer()
		server.once('error', () => {
			resume(Effect.succeed(false))
		})
		server.once('listening', () => {
			server.close(() => {
				resume(Effect.succeed(true))
			})
		})
		server.listen({host, port})
		return Effect.sync(() => {
			server.close()
		})
	})
})

const portAvailable = Effect.fnUntraced(function* (port: number) {
	const localhost = yield* hostPortAvailable('localhost', port)
	if (!localhost) return false
	const loopback = yield* hostPortAvailable('127.0.0.1', port)
	if (!loopback) return false
	return yield* hostPortAvailable('0.0.0.0', port)
})

function commandArg(command: ChildProcess.StandardCommand, index: number) {
	return pipe(command.args, Array.drop(index), Array.head, Option.getOrUndefined)
}

function scriptName(taskId: string) {
	return pipe(
		taskId,
		String.indexOf('#'),
		Option.match({onNone: () => taskId, onSome: index => String.slice(index + 1)(taskId)})
	)
}

function acceptsPortFlags(command: ChildProcess.StandardCommand) {
	const firstArg = commandArg(command, 0)
	const runScript = command.command === 'vp' && firstArg === 'run' ? scriptName(commandArg(command, 1) ?? '') : ''
	return (
		((command.command === 'vp' || command.command === 'vite') && firstArg === 'dev') ||
		runScript === 'dev' ||
		runScript === 'dev:client'
	)
}

function commandArgs(command: ChildProcess.StandardCommand, port: number) {
	const flags = ['--port', port.toString()]
	return acceptsPortFlags(command) ? [...command.args, ...flags] : [...command.args]
}

export class Portless extends Context.Service<Portless>()('@deslop/portless/service/Portless', {
	make: Effect.gen(function* () {
		const server = yield* HttpServer.HttpServer
		const proxyPort =
			server.address._tag === 'TcpAddress'
				? server.address.port.toString()
				: yield* Effect.die('portless requires a TCP HTTP server address')
		const ports = yield* Ref.make(Array.empty<number>())
		const routes = yield* Ref.make(HashMap.empty<string, string>())
		const portLock = yield* Semaphore.make(1)

		function origin(host: string) {
			return `http://${host}:${proxyPort}`
		}
		const allocatePort = Effect.fnUntraced(function* () {
			return yield* pipe(
				Effect.gen(function* () {
					const used = yield* Ref.get(ports)
					for (const port of Array.range(4000, 4999)) {
						if (!Array.contains(used, port) && (yield* portAvailable(port))) {
							yield* Ref.update(ports, Array.append(port))
							return port
						}
					}
					return yield* Effect.die('no portless app ports available')
				}),
				Semaphore.withPermit(portLock)
			)
		})
		const middleware = Effect.fnUntraced(function* <E, R>(
			app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
		) {
			const request = yield* HttpServerRequest.HttpServerRequest
			const host = hostname(request.headers['host'])
			if (Option.isNone(host) || !pipe(host.value, String.endsWith('.localhost'))) return yield* app

			const target = pipe(yield* Ref.get(routes), HashMap.get(host.value))
			if (Option.isNone(target)) return HttpServerResponse.empty({status: 404})
			return pipe(request.headers['upgrade'] ?? '', String.toLowerCase) === 'websocket'
				? yield* proxyWebSocket(request, target.value)
				: yield* proxy(request, target.value)
		})

		return {
			middleware,
			open: Effect.fn('Portless.open')(function* (input: {command: ChildProcess.StandardCommand; segments: string[]}) {
				const port = yield* allocatePort()
				const id = pipe(input.segments, Array.join('.'))
				const worktree = pipe(
					input.segments,
					Array.last,
					Option.getOrElse(() => '')
				)
				const host = `${id}.localhost`
				const routeOrigin = origin(host)
				const baseOrigin = origin(`${pipe(Array.drop(input.segments, 1), Array.join('.'))}.localhost`)
				const env = {
					HOST: 'localhost',
					PORT: port.toString(),
					PORTLESS_BASE_ORIGIN: baseOrigin,
					PORTLESS_ORIGIN: routeOrigin,
					PORTLESS_URL: routeOrigin,
					VITE_PORTLESS_BASE_ORIGIN: baseOrigin,
					VITE_PORTLESS_ORIGIN: routeOrigin,
					VITE_PORTLESS_URL: routeOrigin
				}
				yield* Ref.update(routes, HashMap.set(host, `http://localhost:${port}`))
				yield* Effect.addFinalizer(() =>
					Effect.all([Ref.update(routes, HashMap.remove(host)), Ref.update(ports, Array.remove(port))], {discard: true})
				)

				return {
					command: ChildProcess.make(input.command.command, commandArgs(input.command, port), {
						...input.command.options,
						env: {...input.command.options.env, ...env}
					}),
					env,
					origin: PortlessOrigin.make({
						base: baseOrigin,
						host,
						origin: routeOrigin,
						port,
						sessionId: id,
						taskId: id,
						worktree
					})
				}
			})
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)

	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const portless = yield* Portless
		return yield* portless.middleware(app)
	})
}
