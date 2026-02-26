import {BunServices} from '@effect/platform-bun'
import {Layer, ManagedRuntime, pipe} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import {Git} from '@ai-toolkit/git/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {RpcSerialization} from 'effect/unstable/rpc'

import {AiLive} from '#rpcs/ai/handlers.ts'
import {GitLive} from '#rpcs/git/handlers.ts'
import {AuthMiddlewareHandler} from '#rpcs/middlewares/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(GitLive),
	// rpc middlewares
	Layer.provideMerge(AuthMiddlewareHandler),
	// application layers
	Layer.provideMerge(Agent.layer),
	Layer.provideMerge(Git.layer),
	Layer.provideMerge(OAuth.layer),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(BunServices.layer),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)

export const ServerRuntime = ManagedRuntime.make(LiveLayers)
