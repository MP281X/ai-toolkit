import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpRouter, HttpStaticServer} from 'effect/unstable/http'

import HttpApplication from './main.server.ts'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				HttpApplication,
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				})
			),
			{disableLogger: true}
		),
		Layer.provide(NodeHttpServer.layerConfig(createServer, {port: Config.port('PORT').pipe(Config.withDefault(5000))})),
		Layer.launch
	)
)
