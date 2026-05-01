import {Layer, pipe} from 'effect'

import {Git} from '@ai-toolkit/git/service'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(RpcHandlers),
	// application layers
	Layer.provideMerge(Git.layer),
	// base layers
	Layer.provideMerge(OtelLayer('agent-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
