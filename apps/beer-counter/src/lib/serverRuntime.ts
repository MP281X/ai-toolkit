import {NodeFileSystem, NodePath} from '@effect/platform-node'

import {Layer, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcSerialization} from 'effect/unstable/rpc'

import {BeerCounterLive} from '#lib/beerCounter.ts'
import {RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@deslop/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	Layer.provideMerge(BeerCounterLive),
	// Base layers
	Layer.provideMerge(OtelLayer('beer-counter-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack),
	Layer.provideMerge(KeyValueStore.layerFileSystem('/data')),
	Layer.provideMerge(NodeFileSystem.layer),
	Layer.provideMerge(NodePath.layer)
)
