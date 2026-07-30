import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'

import {Config, Effect, Layer, pipe} from 'effect'

import {HttpRouter, HttpStaticServer} from 'effect/unstable/http'

import HttpApplication from './main.server.ts'

import {Portless} from '@deslop/portless/service'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			pipe(
				Layer.mergeAll(
					HttpRouter.middleware(
						Portless.use(portless => Effect.succeed(portless.middleware)),
						{global: true}
					),
					HttpStaticServer.layer({
						index: 'index.html',
						root: fileURLToPath(new URL('./client', import.meta.url)),
						spa: true
					})
				),
				Layer.provideMerge(HttpApplication)
			),
			{disableLogger: true}
		),
		Layer.provide(
			NodeHttpServer.layerConfig(createServer, {
				gracefulShutdownTimeout: Config.succeed('1500 millis'),
				port: Config.port('PORT').pipe(Config.withDefault(5010))
			})
		),
		Layer.launch
	)
)
