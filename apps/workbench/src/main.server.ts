import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {Portless} from '@deslop/portless/http'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(Portless.middleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(LiveLayers),
		Layer.provide(
			NodeHttpServer.layerConfig(createServer, {
				gracefulShutdownTimeout: Config.succeed('1500 millis'),
				port: Config.withDefault(Config.port('PORT'), 5010)
			})
		),
		Layer.provide(NodeServices.layer),
		Layer.launch
	)
)
