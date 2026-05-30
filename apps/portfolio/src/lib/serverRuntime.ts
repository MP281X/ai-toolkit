import {Layer, pipe} from 'effect'

import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Base layers
	Layer.provideMerge(OtelLayer('portfolio-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
