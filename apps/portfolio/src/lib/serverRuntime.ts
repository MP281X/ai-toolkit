import {Layer, pipe} from 'effect'

import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {RpcSerialization} from 'effect/unstable/rpc'

import {AiLive} from '#rpcs/ai/handlers.ts'
import {PortfolioLive} from '#rpcs/portfolio/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(PortfolioLive),
	// base layers
	Layer.provideMerge(OtelLayer('server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
