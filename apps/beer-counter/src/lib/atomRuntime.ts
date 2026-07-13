import {Effect, Layer, pipe} from 'effect'

import {AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {RpcContracts} from '#rpcs/contracts.ts'

export class RpcClient extends AtomRpc.Service<RpcClient>()('BeerCounterClient', {
	group: RpcContracts,
	protocol: pipe(
		Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}),
		Layer.provideMerge(Socket.layerWebSocket(Effect.succeed(`${location.origin}/api/rpc`))),
		Layer.provideMerge(Socket.layerWebSocketConstructorGlobal),
		Layer.provideMerge(Rpc.RpcSerialization.layerMsgPack)
	)
}) {}
