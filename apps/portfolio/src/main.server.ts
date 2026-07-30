import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

export default pipe(
	Layer.mergeAll(
		RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
		HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
	),
	Layer.provide(LiveLayers)
)
