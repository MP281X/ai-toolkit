import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {AgentRpcContracts, RpcContracts} from '#rpcs/contracts.ts'

const Application = pipe(
	Layer.mergeAll(
		RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
		RpcServer.layerHttp({group: AgentRpcContracts, path: '/api/agent-rpc', protocol: 'websocket'}),
		HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
	),
	Layer.provide(LiveLayers)
)

export default Application
