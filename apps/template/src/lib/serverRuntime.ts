import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

import {AiLive} from '#rpcs/ai/handler.ts'
import {MessagesLive} from '#rpcs/messages/handlers.ts'
import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ReposLive} from '#rpcs/repos/handler.ts'
import {RepoServiceLive} from './repoService.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(MessagesLive),
	Layer.provideMerge(ReposLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareLive),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(RepoServiceLive),
	Layer.provideMerge(OAuth.Default),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
