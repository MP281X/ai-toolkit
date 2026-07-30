import {ConfigProvider, Effect, Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {RpcContracts} from '#rpcs/contracts.ts'
import {OtelLayer} from '@deslop/opentelemetry/client'

const LiveLayers = pipe(
	Layer.empty,
	// Base layers
	Layer.provideMerge(OtelLayer('workbench-client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerMsgPack),
	// Envs
	Layer.provideMerge(
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({
				// oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vite exposes env values through an index signature.
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL']
			})
		)
	)
)

export class RpcClient extends AtomRpc.Service<RpcClient>()('ApiClient', {
	group: RpcContracts,
	protocol: pipe(
		Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}),
		Layer.provide(Socket.layerWebSocket(Effect.sync(() => `${location.origin}/api/rpc`))),
		Layer.provide(Socket.layerWebSocketConstructorGlobal),
		Layer.provide(LiveLayers)
	)
}) {}
