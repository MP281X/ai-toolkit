import {createServer} from 'node:net'
import path from 'node:path'

import {NodeSocket} from '@effect/platform-node'

import {Array, Context, Effect, HashMap, Layer, Match, Option, Predicate, Ref, Semaphore, String, pipe} from 'effect'

import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse
} from 'effect/unstable/http'
import {ChildProcess} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {PortlessOrigin} from './schema.ts'
export function portlessWorktreeId(cwd: string) {
	const segment = pipe(
		path.basename(cwd),
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
export function rewritePortlessHtmlResponse(input: {
	readonly contentType?: string | null
	readonly html: string
	readonly method: string
}) {
	if (input.method !== 'GET' || !htmlContentType(input.contentType)) return
	return rewritePortlessHtml(input.html)
}
const proxy = Effect.fnUntraced(function* (input: {
	readonly client: HttpClient.HttpClient
	readonly origin: string
	readonly request: HttpServerRequest.HttpServerRequest
}) {
	const webRequest = yield* HttpServerRequest.toWeb(input.request)
	const hops = Number.parseInt(webRequest.headers.get('x-portless-hops') ?? '', 10)
	if ((Number.isFinite(hops) ? hops : 0) >= 5) return loopDetectedResponse(Number.isFinite(hops) ? hops : 0)
	const upstreamUrl = new URL(input.request.url, input.origin)
	const headers = new Headers(webRequest.headers)
	headers.set('host', new URL(input.origin).host)
	headers.set('x-portless-hops', `${(Number.isFinite(hops) ? hops : 0) + 1}`)
	const requestInit = {
		body: webRequest.body,
		duplex: 'half',
		headers,
		method: webRequest.method,
		redirect: webRequest.redirect,
		signal: webRequest.signal
	} satisfies RequestInit & {readonly duplex: 'half'}
	const upstream = yield* input.client.execute(HttpClientRequest.fromWeb(new Request(upstreamUrl, requestInit)))
	if (webRequest.method === 'GET' && htmlContentType(upstream.headers['content-type'])) {
		const responseHeaders = new Headers(upstream.headers)
		responseHeaders.delete('content-length')
		responseHeaders.delete('content-encoding')
		responseHeaders.set('content-type', 'text/html; charset=utf-8')
		const html = yield* upstream.text
		const rewritten = rewritePortlessHtmlResponse({
			contentType: upstream.headers['content-type'] ?? null,
			html,
			method: webRequest.method
		})
		return HttpServerResponse.fromWeb(
			new Response(rewritten ?? html, {headers: responseHeaders, status: upstream.status})
		)
	}
	return HttpServerResponse.stream(upstream.stream, {headers: upstream.headers, status: upstream.status})
})
const proxyWebSocket = Effect.fnUntraced(function* (input: {
	readonly origin: string
	readonly request: HttpServerRequest.HttpServerRequest
}) {
	const upstreamUrl = new URL(input.request.url, input.origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	const inbound = yield* input.request.upgrade
	const webSocketConstructor = Layer.succeed(Socket.WebSocketConstructor)(
		(url, protocols) =>
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Effect's constructor uses the DOM WebSocket shape; ws is the Node transport that supports forwarded headers.
			new NodeSocket.NodeWS.WebSocket(url, protocols, {
				headers: pipe(
					input.request.headers['cookie'],
					Option.fromUndefinedOr,
					Option.filter(String.isNonEmpty),
					Option.map(cookie => ({cookie})),
					Option.getOrUndefined
				)
			}) as unknown as globalThis.WebSocket
	)
	const outbound = yield* pipe(Socket.makeWebSocket(upstreamUrl.toString()), Effect.provide(webSocketConstructor))
	const writeInbound = yield* inbound.writer
	const writeOutbound = yield* outbound.writer
	yield* Effect.all(
		[
			pipe(
				outbound.runRaw(message => writeInbound(message)),
				Effect.ignore
			),
			pipe(
				inbound.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice())),
				Effect.ignore
			)
		],
		{concurrency: 'unbounded', discard: true}
	)
	return HttpServerResponse.empty()
})
function hostname(host: string | undefined) {
	return pipe(
		Option.fromUndefinedOr(host),
		Option.flatMap(value => pipe(value, String.split(':'), Array.head))
	)
}
function hostPortAvailable(input: {readonly host: string; readonly port: number}): Effect.Effect<boolean> {
	return Effect.callback<boolean>(resume => {
		const server = createServer()
			.once('error', () => {
				resume(Effect.succeed(false))
			})
			.once('listening', () => {
				server.close(() => {
					resume(Effect.succeed(true))
				})
			})
		server.listen(input)
		return Effect.sync(() => {
			if (server.listening) server.close()
		})
	})
}
const portAvailable = Effect.fnUntraced(function* (port: number) {
	const localhost = yield* hostPortAvailable({host: 'localhost', port})
	if (!localhost) return false
	const loopback = yield* hostPortAvailable({host: '127.0.0.1', port})
	if (!loopback) return false
	return yield* hostPortAvailable({host: '0.0.0.0', port})
})
function commandArg(input: {readonly command: ChildProcess.StandardCommand; readonly index: number}) {
	return pipe(input.command.args, Array.drop(input.index), Array.head, Option.getOrUndefined)
}
function scriptName(taskId: string) {
	const index = taskId.indexOf('#')
	return index < 0 ? taskId : String.slice(index + 1)(taskId)
}
function acceptsPortFlags(command: ChildProcess.StandardCommand) {
	const firstArg = commandArg({command, index: 0})
	const runScript =
		command.command === 'vp' && firstArg === 'run' ? scriptName(commandArg({command, index: 1}) ?? '') : ''
	return (
		((command.command === 'vp' || command.command === 'vite') && firstArg === 'dev') ||
		runScript === 'dev' ||
		runScript === 'dev:client'
	)
}
function commandArgs(input: {readonly command: ChildProcess.StandardCommand; readonly port: number}) {
	const flags = ['--port', input.port.toString()]
	return acceptsPortFlags(input.command) ? [...input.command.args, ...flags] : [...input.command.args]
}
export class Portless extends Context.Service<Portless>()('@deslop/portless/service/Portless', {
	make: Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient
		const server = yield* HttpServer.HttpServer
		const proxyPort = yield* pipe(
			Match.value(server.address),
			Match.when({_tag: 'TcpAddress'}, address => Effect.succeed(address.port.toString())),
			Match.orElse(() => Effect.die('portless requires a TCP HTTP server address'))
		)
		const ports = yield* Ref.make(Array.empty<number>())
		const routes = yield* Ref.make(HashMap.empty<string, string>())
		const portLock = yield* Semaphore.make(1)
		function origin(host: string) {
			return `http://${host}:${proxyPort}`
		}
		const allocatePort = pipe(
			Effect.gen(function* () {
				const used = yield* Ref.get(ports)
				for (const port of Array.range(4000, 4999)) {
					if (Array.contains(used, port) || !(yield* portAvailable(port))) continue
					yield* Ref.update(ports, Array.append(port))
					return port
				}
				return yield* Effect.die(new Error('no portless app ports available'))
			}),
			Semaphore.withPermit(portLock)
		)
		const middleware = Effect.fn('Portless.middleware')(function* <E, R>(
			app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
		) {
			const request = yield* HttpServerRequest.HttpServerRequest
			const host = hostname(request.headers['host'])
			if (Option.isNone(host) || !pipe(host.value, String.endsWith('.localhost'))) return yield* app
			const target = pipe(yield* Ref.get(routes), HashMap.get(host.value))
			if (Option.isNone(target)) return HttpServerResponse.empty({status: 404})
			return pipe(request.headers['upgrade'] ?? '', String.toLowerCase) === 'websocket'
				? yield* proxyWebSocket({origin: target.value, request})
				: yield* proxy({client, origin: target.value, request})
		})
		return {
			middleware,
			open: Effect.fn('Portless.open')(function* (input: {
				readonly command: ChildProcess.StandardCommand
				readonly segments: readonly string[]
			}) {
				const port = yield* allocatePort
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
					command: ChildProcess.make(input.command.command, commandArgs({command: input.command, port}), {
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
	public static layer = pipe(Layer.effect(this, this.make), Layer.provide(FetchHttpClient.layer))
	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const portless = yield* Portless
		return yield* portless.middleware(app)
	})
}
