import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(NodeHttpServer.layerConfig(createServer, {port: Config.port('PORT').pipe(Config.withDefault(5020))})),
		Layer.launch
	)
)
