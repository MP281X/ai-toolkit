import {Context, Effect, Layer, Option, pipe} from 'effect'

import {HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {Socket} from 'effect/unstable/socket'

import {command, discover} from '#lib/utils.ts'

const INJECTED_HEAD = `<script>
(() => {
  if (window.__deslopBrowserBridge) return
  window.__deslopBrowserBridge = true

  const serialize = value => {
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  const send = (level, message) => window.parent?.postMessage({__deslopBrowserLog: true, level, message}, '*')
  const sendFavicon = () => {
    const icon = Array.from(document.head.querySelectorAll('link')).find(link => link.rel === 'shortcut icon' || link.rel.split(/\\s+/).includes('icon'))
    window.parent?.postMessage({__deslopBrowserFavicon: true, href: icon?.href}, '*')
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
    if (event.data?.__deslopBrowserClear !== true) return
    localStorage.clear()
    sessionStorage.clear()
    document.cookie.split(';').forEach(cookie => {
      document.cookie = cookie.replace(/^\\s*([^=]+)=.*$/, '$1=; Max-Age=0; Path=/')
    })
    caches?.keys?.().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    navigator.serviceWorker?.getRegistrations?.().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    location.reload()
  })

  const sendLocation = () => window.parent?.postMessage({__deslopBrowserLocation: true, path: location.pathname + location.search + location.hash}, '*')
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

const injectScripts = Effect.fnUntraced(function* (html: string) {
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, match => `${match}\n${INJECTED_HEAD}`)
		: `${INJECTED_HEAD}\n${html}`
})

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const [pathname = '/', search = ''] = request.url.split('?')
	const upstreamHeaders = new Headers(webRequest.headers)
	upstreamHeaders.set('host', new URL(origin).host)
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
		new Response(yield* injectScripts(body), {
			headers,
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText
		})
	)
})

const proxyWebSocket = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, origin: string) {
	const [pathname = '/', search = ''] = request.url.split('?')
	const protocols = request.headers['sec-websocket-protocol']
		?.split(',')
		.map(protocol => protocol.trim())
		.filter(protocol => protocol.length > 0)
	const inbound = yield* request.upgrade
	const upstreamUrl = new URL(origin)
	upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
	upstreamUrl.pathname = pathname
	upstreamUrl.search = search
	const outbound = yield* Socket.makeWebSocket(upstreamUrl.toString(), {protocols}).pipe(
		Effect.provide(Socket.layerWebSocketConstructorGlobal)
	)
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
		.runRaw(message => writeOutbound(typeof message === 'string' ? message : message.slice()))
		.pipe(
			Effect.catch(() => Effect.void),
			Effect.ensuring(writeOutbound(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void)))
		)

	return HttpServerResponse.empty()
})

const requestHostname = Effect.fnUntraced(function* (host: string | undefined) {
	return Option.fromUndefinedOr(host?.split(':')[0])
})

function isLocalHostname(hostname: string) {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

export class Portless extends Context.Service<Portless>()('@deslop/portless/Portless', {
	make: Effect.sync(() => {
		const ports = new Map<string, number>()
		const routes = new Map<string, string>()

		const middleware = Effect.fnUntraced(function* <E, R>(
			app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
		) {
			const request = yield* HttpServerRequest.HttpServerRequest
			const hostname = yield* requestHostname(request.headers['host'])
			if (Option.isNone(hostname) || isLocalHostname(hostname.value)) return yield* app
			if (!hostname.value.endsWith('.localhost')) return yield* app

			const route = yield* lookup(request.headers['host'])
			if (Option.isNone(route)) return HttpServerResponse.empty({status: 404})
			if (request.headers['upgrade']?.toLowerCase() === 'websocket') {
				return yield* proxyWebSocket(request, route.value)
			}

			return yield* proxy(request, route.value)
		})
		const lookup = Effect.fnUntraced(function* (host: string | undefined) {
			return pipe(
				yield* requestHostname(host),
				Option.flatMap(hostname => Option.fromUndefinedOr(routes.get(hostname)))
			)
		})
		const port = Effect.fnUntraced(function* (key: string) {
			const existing = ports.get(key)
			if (existing !== undefined) return existing

			const reserved = new Set(ports.values())
			for (let port = 4000; port <= 4999; port += 1) {
				const occupied = yield* pipe(
					Effect.tryPromise(() => fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(100)})),
					Effect.as(true),
					Effect.catch(() => Effect.succeed(false))
				)
				if (!reserved.has(port) && !occupied) {
					ports.set(key, port)
					return port
				}
			}
			throw new Error('no portless app ports available')
		})
		const register = Effect.fnUntraced(function* (host: string, port: number) {
			routes.set(host, `http://127.0.0.1:${port}`)
		})
		const scripts = Effect.fnUntraced(function* (cwd: string, input: {readonly proxyPort: string}) {
			return yield* pipe(
				discover(cwd, {port: sessionId => port(`${cwd}:${sessionId}`), proxyPort: input.proxyPort}),
				Effect.map(routes =>
					routes.map(route => ({
						host: route.host,
						port: route.port,
						script: {...route.script, preparedCommand: command(route.script, route.port)}
					}))
				)
			)
		})

		return {middleware, port, register, scripts}
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
