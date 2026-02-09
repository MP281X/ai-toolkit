import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {AgentStore} from '@ai-toolkit/ai/review'
import {GitService} from '@ai-toolkit/git/service'
import {GitStore} from '@ai-toolkit/git/store'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {ReviewStore} from '@ai-toolkit/review/store'

import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ReviewLive} from '#rpcs/review/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(ReviewLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareLive),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(OAuth.Default),
	Layer.provideMerge(ReviewStore.Default),
	Layer.provideMerge(AgentStore.Default),
	Layer.provideMerge(GitService.Default),
	Layer.provideMerge(GitStore.Default),
	// base layers
	Layer.provideMerge(KeyValueStore.layerFileSystem('./.data/review')),
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
