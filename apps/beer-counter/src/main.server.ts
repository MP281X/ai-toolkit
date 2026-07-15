import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'

import {Config, Layer, String, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {AdminSessionRoutes} from '#lib/httpRoutes.ts'
import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
				AdminSessionRoutes,
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(
					HttpMiddleware.cors({
						allowedOrigins: origin => {
							try {
								return (
									new URL(origin).hostname === 'localhost' ||
									pipe(new URL(origin).hostname, String.endsWith('.localhost'))
								)
							} catch {
								return false
							}
						},
						credentials: true
					}),
					{global: true}
				),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(LiveLayers),
		Layer.provide(NodeHttpServer.layerConfig(createServer, {port: Config.port('PORT').pipe(Config.withDefault(5000))})),
		Layer.launch
	)
)
