import {KeyValueStore} from '@effect/platform/KeyValueStore'
import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {GitService} from '@ai-toolkit/review/git'
import {ReviewStore} from '@ai-toolkit/review/store'

import {AiLive} from '#rpcs/ai/handler.ts'
import {MessagesLive} from '#rpcs/messages/handlers.ts'
import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ReviewLive} from '#rpcs/review/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(MessagesLive),
	Layer.provideMerge(ReviewLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareLive),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(OAuth.Default),
	Layer.provideMerge(ReviewStore.Default),
	Layer.provideMerge(GitService.Default),
	// base layers
	Layer.provideMerge(KeyValueStore.layerFileSystem('./.data/review')),
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
