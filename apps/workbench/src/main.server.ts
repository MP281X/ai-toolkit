import {createServer} from 'node:http'
import nodeProcess from 'node:process'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {BrowserProxyMiddleware} from '@deslop/browser/http'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

function makeServer() {
	const server = createServer()
	let exitTimer: NodeJS.Timeout | undefined

	function closeConnections(signal: (typeof shutdownSignals)[number]) {
		server.closeAllConnections()
		server.closeIdleConnections()
		exitTimer ??= setTimeout(() => {
			nodeProcess.exit(signal === 'SIGINT' ? 130 : 143)
		}, 1500)
		exitTimer.unref()
	}

	for (const signal of shutdownSignals) nodeProcess.on(signal, closeConnections)
	server.once('close', () => {
		for (const signal of shutdownSignals) nodeProcess.off(signal, closeConnections)
		if (exitTimer) clearTimeout(exitTimer)
	})

	return server
}

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcGroup.make().merge(RpcContracts), path: '/api/rpc', protocol: 'websocket'}),
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(BrowserProxyMiddleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(LiveLayers),
		Layer.provide(NodeHttpServer.layerConfig(makeServer, {port: Config.port('PORT').pipe(Config.withDefault(4010))})),
		Layer.provide(NodeServices.layer),
		Layer.launch
	)
)
