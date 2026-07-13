import {Layer, pipe} from 'effect'

import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(RpcHandlers),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
