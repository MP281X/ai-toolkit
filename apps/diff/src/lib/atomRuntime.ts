import {ConfigProvider, Layer, pipe} from 'effect'

import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {FetchHttpClient} from 'effect/unstable/http'
import {Atom, AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {RpcContracts} from '#rpcs/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('diff-client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerMsgPack),
	// envs
	Layer.provideMerge(
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL']
			})
		)
	)
)

export class RpcClient extends AtomRpc.Service<RpcClient>()('ApiClient', {
	group: Rpc.RpcGroup.make().merge(RpcContracts),
	protocol: pipe(
		Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}),
		Layer.provideMerge(Socket.layerWebSocket(`${window.origin}/api/rpc`)),
		Layer.provideMerge(Socket.layerWebSocketConstructorGlobal),
		Layer.provideMerge(LiveLayers)
	)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, RpcClient.layer))
