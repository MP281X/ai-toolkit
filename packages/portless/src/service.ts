import {createServer} from 'node:net'

import type {FileSystem, Path} from 'effect'
import {Array, Context, Effect, Layer, Option, Predicate, Semaphore, String, pipe} from 'effect'

import type {PlatformError} from 'effect/PlatformError'
import {HttpServer, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import type {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {PortlessOrigin, type PortlessPreparedRun, PortlessRun, PortlessScript} from './schema.ts'

import {command, discover} from '#lib/utils.ts'

type PortlessMock = {
	readonly clear?: (cwd: string) => Effect.Effect<void>
	readonly remove?: (input: {readonly cwd: string; readonly sessionId: string}) => Effect.Effect<void>
	readonly scripts?: (cwd: string) => Effect.Effect<PortlessPreparedRun[], PlatformError>
}

const INJECTED_HEAD = `<script>
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

const portlessHopsHeader = 'x-portless-hops'
const maxProxyHops = 5

function injectScripts(html: string) {
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, match => `${match}\n${INJECTED_HEAD}`)
		: `${INJECTED_HEAD}\n${html}`
}

function proxyHops(header: string | undefined | null) {
	const hops = Number.parseInt(header ?? '', 10)
	return Number.isFinite(hops) ? hops : 0
}

function loopDetected(hops: number) {
	return hops >= maxProxyHops
}

function loopDetectedResponse(hops: number) {
	return pipe(
		HttpServerResponse.html(
			`<!doctype html><html><head><title>Loop Detected</title></head><body><h1>Loop Detected</h1><p>This request passed through Portless ${hops} times. This usually means a dev server proxy is forwarding back through Portless without rewriting the Host header.</p><p>Set <code>changeOrigin: true</code> in the dev server proxy config.</p></body></html>`
		),
		HttpServerResponse.setStatus(508, 'Loop Detected')
	)
}

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const hops = proxyHops(webRequest.headers.get(portlessHopsHeader))
	if (loopDetected(hops)) return loopDetectedResponse(hops)

	const [pathname = '/', search = ''] = request.url.split('?')
	const upstreamHeaders = new Headers(webRequest.headers)
	upstreamHeaders.set('host', new URL(origin).host)
	upstreamHeaders.set(portlessHopsHeader, `${hops + 1}`)
	const upstreamRequest = new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
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
		request.method === 'GET' && (upstreamResponse.headers.get('content-type') ?? '').includes('text/html')

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
	const hops = proxyHops(request.headers[portlessHopsHeader])
	if (loopDetected(hops)) return loopDetectedResponse(hops)

	const [pathname = '/', search = ''] = request.url.split('?')
	const protocols = pipe(
		Option.fromUndefinedOr(request.headers['sec-websocket-protocol']),
		Option.map(header => pipe(header, String.split(','), Array.map(String.trim), Array.filter(String.isNonEmpty)))
	)
	const inbound = yield* request.upgrade
	const upstreamUrl = new URL(origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	upstreamUrl.pathname = pathname
	upstreamUrl.search = search
	const outbound = yield* Socket.makeWebSocket(upstreamUrl.toString(), {
		protocols: Option.getOrUndefined(protocols)
	}).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
	const writeInbound = yield* inbound.writer
	const writeOutbound = yield* outbound.writer

	yield* outbound
		.runRaw(message => writeInbound(message))
		.pipe(
			Effect.catchReason('SocketError', 'SocketCloseError', reason =>
				writeInbound(new Socket.CloseEvent(reason.code, reason.closeReason)).pipe(Effect.catch(() => Effect.void))
			),
			Effect.catch(() =>
				writeInbound(new Socket.CloseEvent(1011, 'proxy error')).pipe(Effect.catch(() => Effect.void))
			),
			Effect.forkScoped
		)

	yield* inbound
		.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
		.pipe(
			Effect.catch(() => Effect.void),
			Effect.ensuring(writeOutbound(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void)))
		)

	return HttpServerResponse.empty()
})

function requestHostname(host: string | undefined) {
	return pipe(
		Option.fromUndefinedOr(host),
		Option.flatMap(value => pipe(value, String.split(':'), Array.head))
	)
}

function isLocalHostname(hostname: string) {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

const browserBlockedPorts = new Set([
	4000, 4045, 4111, 4190, 4279, 4333, 4559, 4567, 4661, 4662, 4663, 4664, 4665, 4666, 4667, 4668, 4669
])

function portAvailable(port: number) {
	return Effect.promise<boolean>(
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
				server.listen({host: '127.0.0.1', port})
			})
	)
}

export class Portless extends Context.Service<Portless>()('@deslop/portless/service/Portless', {
	make: Effect.gen(function* () {
		const server = yield* HttpServer.HttpServer
		const proxyPort =
			server.address._tag === 'TcpAddress'
				? server.address.port.toString()
				: yield* Effect.die(new Error('portless requires a TCP HTTP server address'))
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
			if (!hostname.value.endsWith('.localhost')) return yield* app

			const route = lookup(request.headers['host'])
			if (Option.isNone(route)) return HttpServerResponse.empty({status: 404})
			if (request.headers['upgrade']?.toLowerCase() === 'websocket') {
				return yield* proxyWebSocket(request, route.value)
			}

			return yield* proxy(request, route.value)
		})
		function lookup(host: string | undefined) {
			return pipe(
				requestHostname(host),
				Option.flatMap(hostname => Option.fromUndefinedOr(routes.get(hostname)))
			)
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
			const nextSessionKeys = new Set(discovered.map(route => `${cwd}:${route.script.sessionId}`))
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
			return yield* pipe(
				Effect.gen(function* () {
					const existing = ports.get(key)
					if (existing !== undefined) return existing

					const reserved = new Set(ports.values())
					for (let candidatePort = 4000; candidatePort <= 4999; candidatePort += 1) {
						if (browserBlockedPorts.has(candidatePort) || reserved.has(candidatePort)) continue
						if (yield* portAvailable(candidatePort)) {
							ports.set(key, candidatePort)
							return candidatePort
						}
					}
					throw new Error('no portless app ports available')
				}),
				Semaphore.withPermit(portLock)
			)
		})
		const scripts = Effect.fn('Portless.scripts')(function* (cwd: string) {
			yield* Effect.annotateCurrentSpan({cwd})

			return yield* pipe(
				discover(cwd, {origin, port: sessionId => port(`${cwd}:${sessionId}`)}),
				Effect.provide(discoveryContext),
				Effect.map(discovered =>
					discovered.map(route =>
						Object.assign(
							new PortlessRun({
								origin: new PortlessOrigin({
									base: route.script.baseOrigin,
									host: route.host,
									origin: route.script.origin,
									port: route.port,
									service: route.script.service,
									sessionId: route.script.sessionId
								}),
								script: new PortlessScript({...route.script, portless: true}),
								status: {state: 'prepared'}
							}),
							{preparedCommand: command(route.script, route.port)}
						)
					)
				),
				Effect.tap(discovered => Effect.sync(() => replaceRoutes(cwd, discovered)))
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
	public static layerMock(input: PortlessMock = {}) {
		return Layer.succeed(this, {
			clear: Effect.fn('Portless.mock.clear')(function* (cwd: string) {
				if (input.clear !== undefined) yield* input.clear(cwd)
			}),
			middleware: Effect.fnUntraced(function* <E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) {
				return yield* app
			}),
			remove: Effect.fn('Portless.mock.remove')(function* (payload: {
				readonly cwd: string
				readonly sessionId: string
			}) {
				if (input.remove !== undefined) yield* input.remove(payload)
			}),
			scripts: Effect.fn('Portless.mock.scripts')(function* (cwd: string) {
				return input.scripts === undefined ? [] : yield* input.scripts(cwd)
			})
		})
	}

	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const portless = yield* Portless

		return yield* portless.middleware(app)
	})
}
