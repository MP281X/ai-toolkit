import {createServer} from 'node:net'

import {Array, Context, Effect, HashMap, HashSet, Layer, Option, Predicate, Semaphore, String, pipe} from 'effect'

import {HttpServer, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import type {ChildProcess} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {PortlessOrigin, PortlessRun, PortlessScript} from './schema.ts'

import {command, discover} from '#lib/utils.ts'

const INJECTED_HEAD = `<script>
(() => {
  if (window.__deslopBrowserBridge) return
  window.__deslopBrowserBridge = true

  const serialize = value => {
    if (typeof value === 'string') return value
    return String(value)
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

function injectScripts(html: string) {
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, match => `${match}\n${INJECTED_HEAD}`)
		: `${INJECTED_HEAD}\n${html}`
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
	const hops = Number.parseInt(webRequest.headers.get('x-portless-hops') ?? '', 10)
	if ((Number.isFinite(hops) ? hops : 0) >= 5) return loopDetectedResponse(Number.isFinite(hops) ? hops : 0)

	const [pathname = '/', search = ''] = String.split(request.url, '?')
	const upstreamHeaders = new Headers(webRequest.headers)
	upstreamHeaders.set('host', new URL(origin).host)
	upstreamHeaders.set('x-portless-hops', `${(Number.isFinite(hops) ? hops : 0) + 1}`)
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
	if (
		!(
			request.method === 'GET' && pipe(upstreamResponse.headers.get('content-type') ?? '', String.includes('text/html'))
		)
	) {
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
	const hops = Number.parseInt(request.headers['x-portless-hops'] ?? '', 10)
	if ((Number.isFinite(hops) ? hops : 0) >= 5) return loopDetectedResponse(Number.isFinite(hops) ? hops : 0)

	const [pathname = '/', search = ''] = String.split(request.url, '?')
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

const browserBlockedPorts = HashSet.fromIterable([
	4000, 4045, 4111, 4190, 4279, 4333, 4559, 4567, 4661, 4662, 4663, 4664, 4665, 4666, 4667, 4668, 4669
])

const portAvailable = Effect.fn('Portless.portAvailable')(function* (port: number) {
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
				server.listen({host: '127.0.0.1', port})
			})
	)
})

export class Portless extends Context.Service<Portless>()('@deslop/portless/service/Portless', {
	make: Effect.gen(function* () {
		const server = yield* HttpServer.HttpServer
		const proxyPort =
			server.address._tag === 'TcpAddress'
				? server.address.port.toString()
				: yield* Effect.die(new Error('portless requires a TCP HTTP server address'))
		const state = {
			cwdRoutes: HashMap.empty<string, HashSet.HashSet<string>>(),
			ports: HashMap.empty<string, number>(),
			routeCwds: HashMap.empty<string, string>(),
			routeSessionKeys: HashMap.empty<string, string>(),
			routes: HashMap.empty<string, string>(),
			sessionRoutes: HashMap.empty<string, string>()
		}
		const portLock = yield* Semaphore.make(1)
		function origin(host: string) {
			return `http://${host}:${proxyPort}`
		}

		const middleware = Effect.fnUntraced(function* <E, R>(
			app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
		) {
			const request = yield* HttpServerRequest.HttpServerRequest
			const hostname = requestHostname(request.headers['host'])
			if (
				Option.isNone(hostname) ||
				hostname.value === 'localhost' ||
				hostname.value === '127.0.0.1' ||
				hostname.value === '::1' ||
				hostname.value === '[::1]'
			) {
				return yield* app
			}
			if (!pipe(hostname.value, String.endsWith('.localhost'))) return yield* app

			const route = lookup(request.headers['host'])
			if (Option.isNone(route)) return HttpServerResponse.empty({status: 404})
			if (pipe(request.headers['upgrade'] ?? '', String.toLowerCase) === 'websocket') {
				return yield* proxyWebSocket(request, route.value)
			}

			return yield* proxy(request, route.value)
		})
		function lookup(host: string | undefined) {
			return pipe(
				requestHostname(host),
				Option.flatMap(hostname => HashMap.get(state.routes, hostname))
			)
		}
		function removeRoute(host: string | undefined) {
			if (Predicate.isUndefined(host)) return
			state.routes = HashMap.remove(state.routes, host)
			pipe(
				HashMap.get(state.routeCwds, host),
				Option.map(cwd => {
					state.cwdRoutes = HashMap.modify(state.cwdRoutes, cwd, hosts => HashSet.remove(hosts, host))
				})
			)
			pipe(
				HashMap.get(state.routeSessionKeys, host),
				Option.map(sessionKey => {
					state.sessionRoutes = HashMap.remove(state.sessionRoutes, sessionKey)
					state.ports = HashMap.remove(state.ports, sessionKey)
				})
			)
			state.routeCwds = HashMap.remove(state.routeCwds, host)
			state.routeSessionKeys = HashMap.remove(state.routeSessionKeys, host)
		}
		function removeCwd(cwd: string, keepSessionKeys = HashSet.empty<string>()) {
			pipe(
				HashMap.get(state.cwdRoutes, cwd),
				Option.map(hosts => {
					for (const host of hosts) {
						state.routes = HashMap.remove(state.routes, host)
						state.routeCwds = HashMap.remove(state.routeCwds, host)
						state.routeSessionKeys = HashMap.remove(state.routeSessionKeys, host)
					}
				})
			)
			state.cwdRoutes = HashMap.remove(state.cwdRoutes, cwd)
			state.sessionRoutes = HashMap.filter(
				state.sessionRoutes,
				(_, sessionKey) => !String.startsWith(`${cwd}:`)(sessionKey) || HashSet.has(keepSessionKeys, sessionKey)
			)
			state.ports = HashMap.filter(
				state.ports,
				(_, sessionKey) => !String.startsWith(`${cwd}:`)(sessionKey) || HashSet.has(keepSessionKeys, sessionKey)
			)
		}
		function replaceRoutes(
			cwd: string,
			discovered: readonly (PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand})[]
		) {
			const nextSessionKeys = pipe(
				discovered,
				Array.map(route => `${cwd}:${route.script.sessionId}`),
				HashSet.fromIterable
			)
			removeCwd(cwd, nextSessionKeys)

			const hosts = pipe(
				discovered,
				Array.map(route => route.origin.host),
				HashSet.fromIterable
			)
			for (const route of discovered) {
				const sessionKey = `${cwd}:${route.script.sessionId}`
				state.routes = HashMap.set(state.routes, route.origin.host, `http://127.0.0.1:${route.origin.port}`)
				state.routeCwds = HashMap.set(state.routeCwds, route.origin.host, cwd)
				state.routeSessionKeys = HashMap.set(state.routeSessionKeys, route.origin.host, sessionKey)
				state.sessionRoutes = HashMap.set(state.sessionRoutes, sessionKey, route.origin.host)
			}
			state.cwdRoutes = HashMap.set(state.cwdRoutes, cwd, hosts)
		}
		const port = Effect.fnUntraced(function* (key: string) {
			return yield* pipe(
				Effect.gen(function* () {
					const existing = HashMap.get(state.ports, key)
					if (Option.isSome(existing)) return existing.value

					for (const candidatePort of Array.range(4000, 4999)) {
						if (
							HashSet.has(browserBlockedPorts, candidatePort) ||
							Array.contains(Array.fromIterable(HashMap.values(state.ports)), candidatePort)
						) {
							continue
						}
						if (yield* portAvailable(candidatePort)) {
							state.ports = HashMap.set(state.ports, key, candidatePort)
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
				Effect.map(discovered =>
					Array.map(discovered, route => ({
						...PortlessRun.make({
							origin: PortlessOrigin.make({
								base: route.script.baseOrigin,
								host: route.host,
								origin: route.script.origin,
								port: route.port,
								sessionId: route.script.sessionId,
								taskId: route.script.taskId
							}),
							script: PortlessScript.make(route.script),
							status: {state: 'prepared'}
						}),
						preparedCommand: command(route.script, route.port)
					}))
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
				removeRoute(Option.getOrUndefined(HashMap.get(state.sessionRoutes, `${input.cwd}:${input.sessionId}`)))
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
}
