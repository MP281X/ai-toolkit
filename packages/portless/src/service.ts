import {readFileSync, statSync} from 'node:fs'
import {createServer, IncomingMessage, ServerResponse} from 'node:http'
import * as net from 'node:net'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import type {FileSystem, Path} from 'effect'
import {Array, Context, Effect, Layer, Match, Option, Semaphore, String, pipe} from 'effect'

import {HttpServer, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import type {ChildProcessSpawner} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {PortlessOrigin, PortlessRun, PortlessScript, PortlessStatus} from './schema.ts'
import type {PortlessPreparedRun} from './schema.ts'

import {command, discover} from '#lib/utils.ts'

function injectScripts(html: string) {
	const injectedHead = `<script>
(() => {
  if (window.__deslopBrowserBridge) return
  window.__deslopBrowserBridge = true

  const serialize = value => {
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  const send = (level, message) => window.parent?.postMessage({deslopBrowserLog: true, level, message}, '*')
  const sendFavicon = () => {
    const icon = Array.from(document.head.querySelectorAll('link')).find(link => link.rel === 'shortcut icon' || link.rel.split(/\\s+/).includes('icon'))
    window.parent?.postMessage({deslopBrowserFavicon: true, href: icon?.href}, '*')
  }

  for (const level of ['debug', 'info', 'log', 'warn', 'error']) {
    const original = console[level]
    console[level] = (...args) => {
      send(level, args.map(serialize).join(' '))
      original.apply(console, args)
    }
  }

  window.addEventListener('error', event => send('error', event.message || 'Resource failed to load'), true)
  window.addEventListener('unhandledrejection', event => send('error', serialize(event.reason)))
  window.addEventListener('message', event => {
    if (event.data?.deslopBrowserClear !== true) return
    localStorage.clear()
    sessionStorage.clear()
    document.cookie.split(';').forEach(cookie => {
      document.cookie = cookie.replace(/^\\s*([^=]+)=.*$/, '$1=; Max-Age=0; Path=/')
    })
    caches?.keys?.().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    navigator.serviceWorker?.getRegistrations?.().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    location.reload()
  })

  const sendLocation = () => window.parent?.postMessage({deslopBrowserLocation: true, path: location.pathname + location.search + location.hash}, '*')
  const wrapHistory = name => {
    const original = history[name]
    history[name] = function(...args) {
      const result = original.apply(this, args)
      sendLocation()
      return result
    }
  }
  wrapHistory('pushState')
  wrapHistory('replaceState')
  window.addEventListener('popstate', sendLocation)
  window.addEventListener('hashchange', sendLocation)

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendFavicon, {once: true})
  else sendFavicon()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendLocation, {once: true})
  else sendLocation()
})()
</script>
<script crossorigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js" onload="window.reactScan?.({allowInIframe: true, _debug: 'verbose'})"></script>
<script src="https://unpkg.com/react-grab/dist/index.global.js"></script>`
	const match = /<head[^>]*>/iu.exec(html)
	if (match === null) return `${injectedHead}\n${html}`

	return `${String.slice(0, match.index + match[0].length)(html)}\n${injectedHead}${String.slice(match.index + match[0].length)(html)}`
}

function proxyHops(header: string | undefined | null) {
	const hops = Number.parseInt(header ?? '', 10)
	return Number.isFinite(hops) ? hops : 0
}

function loopDetected(hops: number) {
	return hops >= 5
}

function loopDetectedResponse(hops: number) {
	return HttpServerResponse.setStatus(
		HttpServerResponse.html(
			`<!doctype html><html><head><title>Loop Detected</title></head><body><h1>Loop Detected</h1><p>This request passed through Portless ${hops} times. This usually means a dev server proxy is forwarding back through Portless without rewriting the Host header.</p><p>Set <code>changeOrigin: true</code> in the dev server proxy config.</p></body></html>`
		),
		508,
		'Loop Detected'
	)
}

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const hops = proxyHops(webRequest.headers.get('x-portless-hops'))
	if (loopDetected(hops)) return loopDetectedResponse(hops)

	const [pathname, search] = String.split('?')(request.url)
	const upstreamHeaders = new Headers(webRequest.headers)
	upstreamHeaders.set('host', new URL(origin).host)
	upstreamHeaders.set('x-portless-hops', `${hops + 1}`)
	const upstreamRequest = new Request(`${origin}${pathname}${String.includes('?')(request.url) ? `?${search}` : ''}`, {
		body: webRequest.body,
		headers: upstreamHeaders,
		method: webRequest.method,
		redirect: webRequest.redirect,
		signal: webRequest.signal
	})
	const upstreamResponse = yield* Effect.tryPromise(() => fetch(upstreamRequest))
	const headers = new Headers(upstreamResponse.headers)
	headers.delete('content-length')
	headers.delete('content-encoding')
	const shouldRewriteHtml =
		request.method === 'GET' && String.includes('text/html')(upstreamResponse.headers.get('content-type') ?? '')

	if (!shouldRewriteHtml) {
		return HttpServerResponse.fromWeb(
			new Response(upstreamResponse.body, {
				headers,
				status: upstreamResponse.status,
				statusText: upstreamResponse.statusText
			})
		)
	}

	const body = yield* Effect.tryPromise(() => upstreamResponse.text())
	headers.set('content-type', 'text/html; charset=utf-8')

	return HttpServerResponse.fromWeb(
		new Response(injectScripts(body), {
			headers,
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText
		})
	)
})

const proxyWebSocket = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const hops = proxyHops(request.headers['x-portless-hops'])
	if (loopDetected(hops)) return loopDetectedResponse(hops)

	const [pathname, search] = String.split('?')(request.url)
	const protocols = Option.map(Option.fromUndefinedOr(request.headers['sec-websocket-protocol']), header =>
		pipe(header, String.split(','), Array.map(String.trim), Array.filter(String.isNonEmpty))
	)
	const inbound = yield* request.upgrade
	const upstreamUrl = new URL(origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	upstreamUrl.pathname = pathname
	upstreamUrl.search = search ?? ''
	const outbound = yield* Socket.makeWebSocket(upstreamUrl.toString(), {
		protocols: Option.getOrUndefined(protocols)
	}).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
	const writeInbound = yield* inbound.writer
	const writeOutbound = yield* outbound.writer

	yield* outbound.runRaw(writeInbound).pipe(Effect.forkScoped)

	yield* inbound.runRaw(writeOutbound).pipe(Effect.ensuring(Effect.orDie(writeOutbound(new Socket.CloseEvent()))))

	return HttpServerResponse.empty()
})

function requestHostname(host: string | undefined) {
	return Option.flatMap(Option.fromUndefinedOr(host), value => pipe(value, String.split(':'), Array.head))
}

function isLocalHostname(hostname: string) {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function staticContentType(file: string) {
	return Match.value(file).pipe(
		Match.when(String.endsWith('.html'), () => 'text/html; charset=utf-8'),
		Match.when(String.endsWith('.css'), () => 'text/css; charset=utf-8'),
		Match.when(
			value => String.endsWith('.js')(value) || String.endsWith('.mjs')(value),
			() => 'text/javascript; charset=utf-8'
		),
		Match.when(String.endsWith('.json'), () => 'application/json; charset=utf-8'),
		Match.when(String.endsWith('.png'), () => 'image/png'),
		Match.when(String.endsWith('.svg'), () => 'image/svg+xml'),
		Match.when(String.endsWith('.woff2'), () => 'font/woff2'),
		Match.orElse(() => 'application/octet-stream')
	)
}

function localStaticRequest(request: IncomingMessage) {
	return Option.match(requestHostname(request.headers.host), {onNone: () => true, onSome: isLocalHostname})
}

function serverResponse(value: unknown): value is ServerResponse {
	return value instanceof ServerResponse
}

function staticFile(input: {readonly clientRoot: string; readonly url: string | undefined}) {
	const indexFile = path.join(input.clientRoot, 'index.html')
	const pathname = decodeURIComponent(new URL(input.url ?? '/', 'http://localhost').pathname)
	const requested = path.resolve(input.clientRoot, `.${pathname}`)
	if (!String.startsWith(`${input.clientRoot}${path.sep}`)(requested) && requested !== input.clientRoot) return

	const file = requested === input.clientRoot ? indexFile : requested
	try {
		return statSync(file).isFile() ? file : indexFile
	} catch {
		return String.startsWith('/assets/')(pathname) ? undefined : indexFile
	}
}

function serveStaticFile(input: {
	readonly clientRoot: string
	readonly request: IncomingMessage
	readonly response: ServerResponse
}) {
	const file = staticFile({clientRoot: input.clientRoot, url: input.request.url})
	if (file === undefined) {
		input.response.writeHead(404).end()
		return
	}

	const info = statSync(file)
	input.response.writeHead(200, {'content-length': info.size, 'content-type': staticContentType(file)})
	if (input.request.method === 'HEAD') {
		input.response.end()
		return
	}
	input.response.end(readFileSync(file))
}

function staticRequest(input: {readonly apiPrefix: string; readonly request: IncomingMessage}) {
	return (
		localStaticRequest(input.request) &&
		input.request.url !== undefined &&
		!String.startsWith(input.apiPrefix)(input.request.url) &&
		(input.request.method === 'GET' || input.request.method === 'HEAD')
	)
}

function portAvailable(port: number) {
	return Effect.promise<boolean>(
		() =>
			new Promise(resolve => {
				const server = net.createServer()
				server.once('error', () => {
					resolve(false)
				})
				server.once('listening', () => {
					server.close(() => {
						resolve(true)
					})
				})
				server.listen({host: '127.0.0.1', port})
			})
	)
}

export class Portless extends Context.Service<Portless>()('@deslop/portless/service/Portless', {
	make: Effect.gen(function* () {
		const server = yield* HttpServer.HttpServer
		const proxyPort = yield* Match.value(server.address).pipe(
			Match.tag('TcpAddress', address => Effect.succeed(address.port.toString())),
			Match.orElse(() => Effect.die(new Error('portless requires a TCP HTTP server address')))
		)
		const ports = new Map<string, number>()
		const routes = new Map<string, string>()
		const cwdRoutes = new Map<string, Set<string>>()
		const routeCwds = new Map<string, string>()
		const routeSessionKeys = new Map<string, string>()
		const sessionRoutes = new Map<string, string>()
		const portLock = yield* Semaphore.make(1)
		const discoveryContext = yield* Effect.context<
			ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
		>()

		function origin(host: string) {
			return `http://${host}:${proxyPort}`
		}

		const middleware = Effect.fnUntraced(function* <E, R>(
			app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
		) {
			const request = yield* HttpServerRequest.HttpServerRequest
			const hostname = requestHostname(request.headers['host'])
			if (Option.isNone(hostname) || isLocalHostname(hostname.value)) return yield* app
			if (!String.endsWith('.localhost')(hostname.value)) return yield* app

			const route = lookup(request.headers['host'])
			if (Option.isNone(route)) return HttpServerResponse.empty({status: 404})
			if (String.toLowerCase(request.headers['upgrade'] ?? '') === 'websocket') {
				return yield* proxyWebSocket(request, route.value)
			}

			return yield* proxy(request, route.value)
		})
		function lookup(host: string | undefined) {
			return Option.flatMap(requestHostname(host), hostname => Option.fromUndefinedOr(routes.get(hostname)))
		}
		function removeRoute(host: string | undefined) {
			if (host === undefined) return
			routes.delete(host)
			const cwd = routeCwds.get(host)
			if (cwd !== undefined) cwdRoutes.get(cwd)?.delete(host)
			const sessionKey = routeSessionKeys.get(host)
			if (sessionKey !== undefined) {
				sessionRoutes.delete(sessionKey)
				ports.delete(sessionKey)
			}
			routeCwds.delete(host)
			routeSessionKeys.delete(host)
		}
		function removeCwd(cwd: string, keepSessionKeys = new Set<string>()) {
			for (const host of cwdRoutes.get(cwd) ?? []) {
				routes.delete(host)
				routeCwds.delete(host)
				routeSessionKeys.delete(host)
			}
			cwdRoutes.delete(cwd)
			for (const entry of sessionRoutes) {
				if (String.startsWith(`${cwd}:`)(entry[0]) && !keepSessionKeys.has(entry[0])) sessionRoutes.delete(entry[0])
			}
			for (const entry of ports) {
				if (String.startsWith(`${cwd}:`)(entry[0]) && !keepSessionKeys.has(entry[0])) ports.delete(entry[0])
			}
		}
		function replaceRoutes(cwd: string, discovered: readonly PortlessPreparedRun[]) {
			const nextSessionKeys = new Set(Array.map(discovered, route => `${cwd}:${route.script.sessionId}`))
			removeCwd(cwd, nextSessionKeys)

			const hosts = new Set<string>()
			for (const route of discovered) {
				const sessionKey = `${cwd}:${route.script.sessionId}`
				hosts.add(route.origin.host)
				routes.set(route.origin.host, `http://127.0.0.1:${route.origin.port}`)
				routeCwds.set(route.origin.host, cwd)
				routeSessionKeys.set(route.origin.host, sessionKey)
				sessionRoutes.set(sessionKey, route.origin.host)
			}
			cwdRoutes.set(cwd, hosts)
		}
		const port = Effect.fnUntraced(function* (key: string) {
			return yield* portLock.withPermit(
				Effect.gen(function* () {
					const existing = ports.get(key)
					if (existing !== undefined) return existing

					const reserved = new Set(ports.values())
					const candidate = yield* Effect.findFirst(Array.range(4000, 4999), candidatePort =>
						Array.contains(
							[4000, 4045, 4111, 4190, 4279, 4333, 4559, 4567, 4661, 4662, 4663, 4664, 4665, 4666, 4667, 4668, 4669],
							candidatePort
						) || reserved.has(candidatePort)
							? Effect.succeed(false)
							: portAvailable(candidatePort)
					)
					if (Option.isNone(candidate)) throw new Error('no portless app ports available')

					ports.set(key, candidate.value)
					return candidate.value
				})
			)
		})
		const scripts = Effect.fn('Portless.scripts')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})

			return yield* pipe(
				discover(cwd, {origin, port: sessionId => port(`${cwd}:${sessionId}`)}),
				Effect.provide(discoveryContext),
				Effect.map(discovered =>
					Array.map(discovered, route =>
						Object.assign(
							new PortlessRun({
								origin: new PortlessOrigin({
									base: route.script.baseOrigin,
									host: route.host,
									origin: route.script.origin,
									port: route.port,
									sessionId: route.script.sessionId,
									taskId: route.script.taskId
								}),
								script: new PortlessScript(route.script),
								status: new PortlessStatus({state: 'prepared'})
							}),
							{preparedCommand: command(route.script, route.port)}
						)
					)
				),
				Effect.tap(discovered =>
					Effect.sync(() => {
						replaceRoutes(cwd, discovered)
					})
				)
			)
		})

		return {
			clear: Effect.fn('Portless.clear')(function* (cwd: string) {
				yield* Effect.annotateCurrentSpan({cwd})
				removeCwd(cwd)
			}),
			middleware,
			remove: Effect.fn('Portless.remove')(function* (input: {readonly cwd: string; readonly sessionId: string}) {
				yield* Effect.annotateCurrentSpan({cwd: input.cwd, sessionId: input.sessionId})
				removeRoute(sessionRoutes.get(`${input.cwd}:${input.sessionId}`))
			}),
			scripts
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

	public static staticServer(input: {readonly apiPrefix: string; readonly clientRoot: URL}) {
		const clientRoot = fileURLToPath(input.clientRoot)
		const server = createServer()
		const emit = server.emit.bind(server)
		server.emit = (event: string | symbol, ...args: unknown[]) => {
			if (
				event === 'request' &&
				args[0] instanceof IncomingMessage &&
				serverResponse(args[1]) &&
				staticRequest({apiPrefix: input.apiPrefix, request: args[0]})
			) {
				serveStaticFile({clientRoot, request: args[0], response: args[1]})
				return true
			}

			return Reflect.apply(emit, server, [event, ...args])
		}

		return server
	}
}
