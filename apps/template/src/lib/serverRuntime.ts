import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

import {AiLive} from '#rpcs/ai/handlers.ts'
import {AuthMiddlewareHandler} from '#rpcs/middlewares/handlers.ts'
import {SessionsLive} from '#rpcs/sessions/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(SessionsLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareHandler),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(OAuth.Default),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
