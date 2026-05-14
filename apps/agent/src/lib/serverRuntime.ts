import {Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {GitWorkspace} from '@ai-toolkit/git/service'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Application layers
	Layer.provideMerge(GitWorkspace.layer),
	// Base layers
	Layer.provideMerge(OtelLayer('agent-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
