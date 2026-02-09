import * as BunKeyValueStore from '@effect/platform-bun/BunKeyValueStore'
import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {ResearchEngine} from '@ai-toolkit/research/service'
import {ResearchStore} from '@ai-toolkit/research/storage'

import {AiLive} from '#rpcs/ai/handler.ts'
import {MessagesLive} from '#rpcs/messages/handlers.ts'
import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ResearchLive} from '#rpcs/research/handler.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(MessagesLive),
	Layer.provideMerge(ResearchLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareLive),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(OAuth.Default),
	Layer.provideMerge(BunKeyValueStore.layerFileSystem('./data/research')),
	Layer.provideMerge(ResearchStore.Default),
	Layer.provideMerge(ResearchEngine.Default),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
