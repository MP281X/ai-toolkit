import {Layer} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {HttpRouter} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers, ServerRuntime} from '#lib/serverRuntime.ts'
import {AiContracts} from '#rpcs/ai/contracts.ts'
import {GitContracts} from '#rpcs/git/contracts.ts'

const group = RpcGroup.make().merge(AiContracts, GitContracts)

const {handler} = HttpRouter.toWebHandler(
	RpcServer.layerHttp({group, path: '/api/rpc', protocol: 'http'}).pipe(Layer.provideMerge(LiveLayers)),
	{memoMap: ServerRuntime.memoMap}
)

export const Route = createFileRoute('/api/rpc')({
	server: {
		handlers: {
			POST: ({request}) => handler(request)
		}
	}
})
