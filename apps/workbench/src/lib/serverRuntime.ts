import {Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {GitWorkspace} from '@deslop/git/service'
import {OtelLayer} from '@deslop/opentelemetry/server'
import {Os} from '@deslop/os/service'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Application layers
	Layer.provideMerge(GitWorkspace.layer),
	Layer.provideMerge(Os.layer),
	// Base layers
	Layer.provideMerge(OtelLayer('workbench-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
