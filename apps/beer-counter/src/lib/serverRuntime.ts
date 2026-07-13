import {NodeFileSystem, NodePath} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {OtelLayer} from '@deslop/opentelemetry/server'

const dataDir = Config.string('DATA_DIR').pipe(Config.withDefault('/data'))

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(RpcHandlers),
	Layer.provideMerge(OtelLayer('beer-counter-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack),
	Layer.provideMerge(Layer.unwrap(dataDir.pipe(Config.map(directory => KeyValueStore.layerFileSystem(directory))))),
	Layer.provideMerge(NodeFileSystem.layer),
	Layer.provideMerge(NodePath.layer)
)
