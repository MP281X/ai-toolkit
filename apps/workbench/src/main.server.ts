import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {AgentBrowser} from '@deslop/agent-browser/service'
import {Portless} from '@deslop/portless/service'

export default pipe(
	Layer.mergeAll(
		RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
		HttpRouter.middleware(AgentBrowser.middleware, {global: true}),
		HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
	),
	Layer.provide(LiveLayers),
	Layer.provideMerge(Portless.layer)
)
