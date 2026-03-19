import {Layer, pipe} from 'effect'

import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(RpcHandlers),
	// base layers
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(OtelLayer('note-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
