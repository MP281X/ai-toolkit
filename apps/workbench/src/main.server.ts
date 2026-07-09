import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {AgentBrowser} from '@deslop/agent-browser/service'
import {Portless} from '@deslop/portless/service'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				pipe(
					RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
					Layer.provide(LiveLayers)
				),
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(AgentBrowser.middleware, {global: true}),
				HttpRouter.middleware(Portless.middleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(Portless.layer),
		Layer.provide(
			NodeHttpServer.layerConfig(createServer, {
				gracefulShutdownTimeout: Config.succeed('1500 millis'),
				port: Config.port('PORT').pipe(Config.withDefault(5010))
			})
		),
		Layer.provide(NodeServices.layer),
		Layer.launch
	)
)
