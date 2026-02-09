import {FetchHttpClient} from '@effect/platform'
import {BrowserSocket} from '@effect/platform-browser'
import {RpcClient, RpcGroup, RpcSerialization} from '@effect/rpc'
import {ConfigProvider, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/client'
import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {Atom, AtomRpc} from '@effect-atom/atom-react'

import {ReviewRpcs} from '#rpcs/review/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerNdjson),
	// application layers
	Layer.provideMerge(OAuth.Default),
	// envs
	Layer.provideMerge(
		Layer.setConfigProvider(
			ConfigProvider.fromJson({
				AUTH_BASE_URL: import.meta.env['VITE_AUTH_BASE_URL']
			})
		)
	)
)

export class ApiClient extends AtomRpc.Tag<ApiClient>()('ApiClient', {
	group: RpcGroup.make().merge(ReviewRpcs),
	protocol: RpcClient.layerProtocolSocket({retryTransientErrors: true}).pipe(
		Layer.provide(BrowserSocket.layerWebSocket('/api/rpc')),
		Layer.provide(RpcSerialization.layerNdjson)
	)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, ApiClient.layer))
