import {RpcGroup, RpcServer} from '@effect/rpc'

import {createFileRoute} from '@tanstack/react-router'

import {LiveLayers, ServerRuntime} from '#lib/serverRuntime.ts'
import {AiContracts} from '#rpcs/ai/contracts.ts'
import {GitContracts} from '#rpcs/git/contracts.ts'
import {SessionsContracts} from '#rpcs/sessions/contracts.ts'

const {handler} = RpcServer.toWebHandler(RpcGroup.make().merge(AiContracts, GitContracts, SessionsContracts), {
	layer: LiveLayers,
	memoMap: ServerRuntime.memoMap
})

export const Route = createFileRoute('/api/rpc')({
	server: {
		handlers: {
			POST: ({request}) => handler(request)
		}
	}
})
