import {BunHttpServer, BunRuntime} from '@effect/platform-bun'

import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

BunRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({
					path: '/api/rpc',
					protocol: 'websocket',
					group: RpcGroup.make().merge(RpcContracts)
				}),
				HttpStaticServer.layer({
					spa: true,
					root: './dist/client',
					index: 'index.html'
				}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			)
		),
		Layer.provide(LiveLayers),
		Layer.provide(BunHttpServer.layer({hostname: '0.0.0.0'})),
		Layer.launch
	)
)
