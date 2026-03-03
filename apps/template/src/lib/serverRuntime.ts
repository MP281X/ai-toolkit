import {BunServices} from '@effect/platform-bun'
import {Layer, pipe} from 'effect'

import {Git} from '@ai-toolkit/git/service'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {RpcSerialization} from 'effect/unstable/rpc'

import {AiLive} from '#rpcs/ai/handlers.ts'
import {GitLive} from '#rpcs/git/handlers.ts'
import {RealtimeLive} from '#rpcs/realtime/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(GitLive),
	Layer.provideMerge(RealtimeLive),
	// application layers
	Layer.provideMerge(Git.layer),
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	Layer.provideMerge(BunServices.layer),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
