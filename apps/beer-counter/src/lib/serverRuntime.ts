import {NodeFileSystem, NodePath} from '@effect/platform-node'

import {Layer, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcSerialization} from 'effect/unstable/rpc'

import {TeamStore} from '#lib/teamStore.ts'
import {RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@deslop/opentelemetry/server'

const PersistenceLive = KeyValueStore.layerFileSystem('/data').pipe(
	Layer.provide(NodeFileSystem.layer),
	Layer.provide(NodePath.layer)
)

const TeamStoreLive = TeamStore.layer.pipe(Layer.provide(PersistenceLive))

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(RpcHandlers.pipe(Layer.provide(TeamStoreLive))),
	Layer.provideMerge(OtelLayer('beer-counter-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
