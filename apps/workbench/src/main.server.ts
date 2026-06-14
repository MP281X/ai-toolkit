import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {Portless} from '@deslop/portless/service'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}).pipe(
					Layer.provide(LiveLayers)
				),
				HttpRouter.middleware(Portless.middleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(Portless.layer),
		Layer.provide(
			NodeHttpServer.layerConfig(
				() => Portless.staticServer({apiPrefix: '/api/rpc', clientRoot: new URL('./client', import.meta.url)}),
				{
					gracefulShutdownTimeout: Config.succeed('1500 millis'),
					port: Config.port('PORT').pipe(Config.withDefault(5010))
				}
			)
		),
		Layer.provide(NodeServices.layer),
		Layer.launch
	)
)
