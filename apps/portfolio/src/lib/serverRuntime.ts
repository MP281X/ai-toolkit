import {Layer, pipe} from 'effect'

import {Git} from '@ai-toolkit/git/service'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {RpcSerialization} from 'effect/unstable/rpc'

import {AiLive} from '#rpcs/ai/handlers.ts'
import {GitLive} from '#rpcs/git/handlers.ts'
import {PortfolioLive} from '#rpcs/portfolio/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(AiLive),
	Layer.provideMerge(GitLive),
	Layer.provideMerge(PortfolioLive),
	// application layers
	Layer.provideMerge(Git.layerMock),
	// base layers
	Layer.provideMerge(OtelLayer('server')),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)
