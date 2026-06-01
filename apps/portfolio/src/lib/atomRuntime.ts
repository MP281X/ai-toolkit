import {ConfigProvider, Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {RpcContracts} from '#rpcs/contracts.ts'
import {OtelLayer} from '@deslop/opentelemetry/client'

export const LiveLayers = pipe(
	Layer.empty,
	// Base layers
	Layer.provideMerge(OtelLayer('portfolio-client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerMsgPack),
	// Envs
	Layer.provideMerge(
		ConfigProvider.layer(ConfigProvider.fromUnknown({VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL']}))
	)
)

export class RpcClient extends AtomRpc.Service<RpcClient>()('ApiClient', {
	group: RpcContracts,
	protocol: pipe(
		Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}),
		Layer.provideMerge(Socket.layerWebSocket(`${location.origin}/api/rpc`)),
		Layer.provideMerge(Socket.layerWebSocketConstructorGlobal),
		Layer.provideMerge(LiveLayers)
	)
}) {}
