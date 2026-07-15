import {Layer, pipe} from 'effect'

import {RpcSerialization} from 'effect/unstable/rpc'

import {AdminAuthLive} from '#lib/adminAuth.ts'
import {CounterLive} from '#lib/counter.ts'
import {AdminAuthorizationLive, RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@deslop/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	Layer.provideMerge(AdminAuthorizationLive),
	Layer.provideMerge(CounterLive),
	Layer.provideMerge(AdminAuthLive),
	// Base layers
	Layer.provideMerge(OtelLayer('beer-counter-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
