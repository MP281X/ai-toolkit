import {Layer, pipe} from 'effect'

import {RpcSerialization} from 'effect/unstable/rpc'

import {CounterLive} from '#lib/counter.ts'
import {AdminSessionsLive} from '#lib/sessions.ts'
import {AdminSessionLive, RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@deslop/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	Layer.provideMerge(AdminSessionLive),
	Layer.provideMerge(CounterLive),
	Layer.provideMerge(AdminSessionsLive),
	// Base layers
	Layer.provideMerge(OtelLayer('beer-counter-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
