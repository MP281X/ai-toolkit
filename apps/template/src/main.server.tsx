import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {AiContracts} from '#rpcs/ai/contracts.ts'
import {GitContracts} from '#rpcs/git/contracts.ts'

BunRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({
					path: '/api/rpc',
					protocol: 'websocket',
					group: RpcGroup.make().merge(AiContracts, GitContracts)
				}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			)
		),
		Layer.provide(LiveLayers),
		Layer.provide(BunHttpServer.layer({hostname: '0.0.0.0'})),
		Layer.launch
	)
)
