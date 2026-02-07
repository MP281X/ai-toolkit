import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

import {AiLive, MessagesLive} from '#rpcs/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(MessagesLive),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
