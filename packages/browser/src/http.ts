import {Effect} from 'effect'

import {HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {Socket} from 'effect/unstable/socket'

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendFavicon, {once: true})
  else sendFavicon()
})()
</script>
<script crossorigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js" onload="window.reactScan?.({allowInIframe: true, _debug: 'verbose'})"></script>
<script src="https://unpkg.com/react-grab/dist/index.global.js"></script>`

function injectScripts(html: string) {
	return /<head[^>]*>/i.test(html)
		? html.replace(/<head[^>]*>/i, match => `${match}\n${INJECTED_HEAD}`)
		: `${INJECTED_HEAD}\n${html}`
}

const proxy = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, port: string) {
	const webRequest = yield* HttpServerRequest.toWeb(request)
	const [pathname = '/', search = ''] = request.url.split('?')
	const upstreamHeaders = new Headers(webRequest.headers)
	upstreamHeaders.set('host', `localhost:${port}`)
	const upstreamRequest = new Request(`http://localhost:${port}${pathname}${search ? `?${search}` : ''}`, {
		body: webRequest.body,
		headers: upstreamHeaders,
		method: webRequest.method,
		redirect: webRequest.redirect,
		signal: webRequest.signal
	})
	const upstreamResponse = yield* Effect.tryPromise(() => fetch(upstreamRequest))
	const shouldRewriteHtml =
		request.method === 'GET' && (upstreamResponse.headers.get('content-type') ?? '').includes('text/html')
	const headers = new Headers(upstreamResponse.headers)
	headers.delete('content-length')
	headers.delete('content-encoding')

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

const proxyWebSocket = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest, port: string) {
	const [pathname = '/', search = ''] = request.url.split('?')
	const protocols = request.headers['sec-websocket-protocol']
		?.split(',')
		.map(protocol => protocol.trim())
		.filter(protocol => protocol.length > 0)
	const clientSocket = yield* request.upgrade
	const upstreamSocket = yield* Socket.makeWebSocket(`ws://localhost:${port}${pathname}${search ? `?${search}` : ''}`, {
		protocols
	}).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
	const clientWriter = yield* clientSocket.writer
	const upstreamWriter = yield* upstreamSocket.writer

	yield* Effect.all([clientSocket.runRaw(upstreamWriter), upstreamSocket.runRaw(clientWriter)], {
		concurrency: 'unbounded'
	}).pipe(
		Effect.scoped,
		Effect.catch(() => Effect.void)
	)

	return HttpServerResponse.empty()
})

export function BrowserProxyMiddleware<E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) {
	return Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest
		const port = /^(\d+)\.localhost(?::\d+)?$/u.exec(request.headers['host'] ?? '')?.[1]
		if (!port) return yield* app
		if (request.headers['upgrade']?.toLowerCase() === 'websocket') return yield* proxyWebSocket(request, port)

		return yield* proxy(request, port)
	})
}

export function url(port: number) {
	return `http://${port}.localhost/`
}
