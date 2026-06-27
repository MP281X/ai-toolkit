import {readFileSync, statSync} from 'node:fs'
import {createServer, IncomingMessage, ServerResponse} from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, Predicate, String, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

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

function localRequest(request: IncomingMessage) {
	return (
		Predicate.isUndefined(request.headers.host) ||
		request.headers.host === 'localhost' ||
		String.startsWith('localhost:')(request.headers.host)
	)
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

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				pipe(
					RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
					Layer.provide(LiveLayers)
				),
				HttpRouter.middleware(AgentBrowser.middleware, {global: true}),
				HttpRouter.middleware(Portless.middleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
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
