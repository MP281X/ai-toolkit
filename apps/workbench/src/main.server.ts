import {readFileSync, statSync} from 'node:fs'
import {createServer, IncomingMessage, ServerResponse} from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Array, Config, Effect, Layer, Option, Predicate, String, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {AgentBrowser} from '@deslop/agent-browser/service'
import {Portless} from '@deslop/portless/service'

const clientRoot = fileURLToPath(new URL('./client', import.meta.url))
const indexFile = path.join(clientRoot, 'index.html')

function contentType(file: string) {
	if (String.endsWith('.html')(file)) return 'text/html; charset=utf-8'
	if (String.endsWith('.css')(file)) return 'text/css; charset=utf-8'
	if (String.endsWith('.js')(file) || String.endsWith('.mjs')(file)) return 'text/javascript; charset=utf-8'
	if (String.endsWith('.json')(file)) return 'application/json; charset=utf-8'
	if (String.endsWith('.png')(file)) return 'image/png'
	if (String.endsWith('.svg')(file)) return 'image/svg+xml'
	if (String.endsWith('.woff2')(file)) return 'font/woff2'
	return 'application/octet-stream'
}

function localHostname(host: string | undefined) {
	if (Predicate.isUndefined(host)) return
	return pipe(host, String.split(':'), Array.head, Option.getOrUndefined)
}

function localRequest(request: IncomingMessage) {
	const hostname = localHostname(request.headers.host)
	return Predicate.isUndefined(hostname) || hostname === 'localhost'
}

function staticFile(url: string | undefined) {
	const pathname = decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname)
	const requested = path.resolve(clientRoot, `.${pathname}`)
	if (!String.startsWith(`${clientRoot}${path.sep}`)(requested) && requested !== clientRoot) return

	const file = requested === clientRoot ? indexFile : requested
	try {
		return statSync(file).isFile() ? file : indexFile
	} catch {
		return String.startsWith('/assets/')(pathname) ? undefined : indexFile
	}
}

function serveStatic(
	request: IncomingMessage,
	response: {readonly end: ServerResponse['end']; readonly writeHead: ServerResponse['writeHead']}
) {
	const file = staticFile(request.url)
	if (Predicate.isUndefined(file)) {
		response.writeHead(404).end()
		return
	}

	const info = statSync(file)
	response.writeHead(200, {'content-length': info.size, 'content-type': contentType(file)})
	if (request.method === 'HEAD') {
		response.end()
		return
	}
	response.end(readFileSync(file))
}

function createWorkbenchServer() {
	const server = createServer()
	const emit = server.emit.bind(server)
	server.emit = (event: string | symbol, ...args: unknown[]) => {
		if (event === 'request' && args[0] instanceof IncomingMessage && args[1] instanceof ServerResponse) {
			const request = args[0]
			if (
				localRequest(request) &&
				Predicate.isNotUndefined(request.url) &&
				!String.startsWith('/api/rpc')(request.url) &&
				!String.startsWith('/api/agent-browser')(request.url) &&
				(request.method === 'GET' || request.method === 'HEAD')
			) {
				serveStatic(request, args[1])
				return true
			}
		}

		return emit(event, ...args)
	}

	return server
}

const agentBrowserStreamProxy = pipe(
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest
		const params = yield* HttpRouter.params
		if (Predicate.isUndefined(params['session'])) return HttpServerResponse.empty({status: 404})

		const agentBrowser = yield* AgentBrowser
		const session = yield* pipe(agentBrowser.session({session: params['session']}), Effect.option)
		if (Option.isNone(session)) return HttpServerResponse.empty({status: 404})
		const outbound = yield* pipe(
			Socket.makeWebSocket(`ws://127.0.0.1:${session.value.streamPort}`),
			Effect.provide(Socket.layerWebSocketConstructorGlobal),
			Effect.option
		)
		if (Option.isNone(outbound)) return HttpServerResponse.empty({status: 502})

		const inbound = yield* request.upgrade
		const writeInbound = yield* inbound.writer
		const writeOutbound = yield* outbound.value.writer

		yield* Effect.all(
			[
				outbound.value
					.runRaw(message => writeInbound(message))
					.pipe(
						Effect.catchReason('SocketError', 'SocketCloseError', reason =>
							writeInbound(new Socket.CloseEvent(reason.code, reason.closeReason)).pipe(Effect.catch(() => Effect.void))
						),
						Effect.catch(() =>
							writeInbound(new Socket.CloseEvent(1011, 'agent-browser proxy error')).pipe(
								Effect.catch(() => Effect.void)
							)
						)
					),
				inbound
					.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
					.pipe(
						Effect.catch(() => Effect.void),
						Effect.ensuring(writeOutbound(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void)))
					)
			],
			{concurrency: 'unbounded', discard: true}
		)

		return HttpServerResponse.empty()
	}),
	Effect.catch(() => Effect.succeed(HttpServerResponse.empty({status: 404})))
)

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				pipe(
					HttpRouter.addAll([
						HttpRouter.route('GET', '/api/agent-browser/sessions/:session/stream', agentBrowserStreamProxy)
					]),
					Layer.provide(AgentBrowser.layer)
				),
				pipe(
					RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
					Layer.provide(LiveLayers)
				),
				HttpRouter.middleware(Portless.middleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(AgentBrowser.layer),
		Layer.provide(Portless.layer),
		Layer.provide(
			NodeHttpServer.layerConfig(createWorkbenchServer, {
				gracefulShutdownTimeout: Config.succeed('1500 millis'),
				port: Config.port('PORT').pipe(Config.withDefault(5010))
			})
		),
		Layer.provide(NodeServices.layer),
		Layer.launch
	)
)
