import {createServer} from 'node:net'
import path from 'node:path'

import {Array, Context, Effect, HashMap, Layer, Option, Predicate, Ref, Semaphore, String, pipe} from 'effect'

import {HttpServer, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
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

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const hops = Number.parseInt(webRequest.headers.get('x-portless-hops') ?? '', 10)
	if ((Number.isFinite(hops) ? hops : 0) >= 5) return loopDetectedResponse(Number.isFinite(hops) ? hops : 0)

	const [pathname = '/', search = ''] = String.split(request.url, '?')
	const headers = new Headers(webRequest.headers)
	headers.set('host', new URL(origin).host)
	headers.set('x-portless-hops', `${(Number.isFinite(hops) ? hops : 0) + 1}`)
	const upstream = yield* Effect.tryPromise(() =>
		fetch(
			new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
				body: webRequest.body,
				headers,
				method: webRequest.method,
				redirect: webRequest.redirect,
				signal: webRequest.signal
			})
		)
	)
	const responseHeaders = new Headers(upstream.headers)
	responseHeaders.delete('content-length')
	responseHeaders.delete('content-encoding')
	return HttpServerResponse.fromWeb(
		new Response(upstream.body, {headers: responseHeaders, status: upstream.status, statusText: upstream.statusText})
	)
})

const proxyWebSocket = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const [pathname = '/', search = ''] = String.split(request.url, '?')
	const upstreamUrl = new URL(origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	upstreamUrl.pathname = pathname
	upstreamUrl.search = search

	const inbound = yield* request.upgrade
	const outbound = yield* Socket.makeWebSocket(upstreamUrl.toString()).pipe(
		Effect.provide(Socket.layerWebSocketConstructorGlobal)
	)
	const writeInbound = yield* inbound.writer
	const writeOutbound = yield* outbound.writer

	yield* Effect.all(
		[
			outbound.runRaw(message => writeInbound(message)).pipe(Effect.catch(() => Effect.void)),
			inbound
				.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
				.pipe(Effect.catch(() => Effect.void))
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

const hostPortAvailable = Effect.fnUntraced(function* (host: string, port: number) {
	return yield* Effect.promise<boolean>(
		() =>
			new Promise(resolve => {
				const server = createServer()
				server.once('error', () => {
					resolve(false)
				})
				server.once('listening', () => {
					server.close(() => {
						resolve(true)
					})
				})
				server.listen({host, port})
			})
	)
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
	const index = taskId.indexOf('#')
	return index < 0 ? taskId : String.slice(index + 1)(taskId)
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
				: yield* Effect.die(new Error('portless requires a TCP HTTP server address'))
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
						if (Array.contains(used, port) || !(yield* portAvailable(port))) continue
						yield* Ref.update(ports, Array.append(port))
						return port
					}
					return yield* Effect.die(new Error('no portless app ports available'))
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
			open: Effect.fn('Portless.open')(function* (input: {
				readonly command: ChildProcess.StandardCommand
				readonly segments: readonly string[]
			}) {
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
