import {readFileSync, statSync} from 'node:fs'
import {createServer, IncomingMessage, ServerResponse} from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {Portless} from '@deslop/portless/service'

const clientRoot = fileURLToPath(new URL('./client', import.meta.url))
const indexFile = path.join(clientRoot, 'index.html')

function contentType(file: string) {
	if (file.endsWith('.html')) return 'text/html; charset=utf-8'
	if (file.endsWith('.css')) return 'text/css; charset=utf-8'
	if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
	if (file.endsWith('.json')) return 'application/json; charset=utf-8'
	if (file.endsWith('.png')) return 'image/png'
	if (file.endsWith('.svg')) return 'image/svg+xml'
	if (file.endsWith('.woff2')) return 'font/woff2'
	return 'application/octet-stream'
}

function localHostname(host: string | undefined) {
	return host?.split(':')[0]
}

function localRequest(request: IncomingMessage) {
	const hostname = localHostname(request.headers.host)
	return hostname === undefined || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function serverResponse(value: unknown): value is ServerResponse {
	return value instanceof ServerResponse
}

function staticFile(url: string | undefined) {
	const pathname = decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname)
	const requested = path.resolve(clientRoot, `.${pathname}`)
	if (!requested.startsWith(`${clientRoot}${path.sep}`) && requested !== clientRoot) return

	const file = requested === clientRoot ? indexFile : requested
	try {
		return statSync(file).isFile() ? file : indexFile
	} catch {
		return pathname.startsWith('/assets/') ? undefined : indexFile
	}
}

function serveStatic(request: IncomingMessage, response: ServerResponse) {
	const file = staticFile(request.url)
	if (file === undefined) {
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
		if (event === 'request' && args[0] instanceof IncomingMessage && serverResponse(args[1])) {
			const request = args[0]
			if (
				localRequest(request) &&
				request.url !== undefined &&
				!request.url.startsWith('/api/rpc') &&
				(request.method === 'GET' || request.method === 'HEAD')
			) {
				serveStatic(request, args[1])
				return true
			}
		}

		return Reflect.apply(emit, server, [event, ...args])
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
