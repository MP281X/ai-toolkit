import {Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Base layers
	Layer.provideMerge(OtelLayer('lab-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
