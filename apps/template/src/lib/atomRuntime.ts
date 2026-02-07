import {FetchHttpClient} from '@effect/platform'
import {BrowserSocket} from '@effect/platform-browser'
import {RpcClient, RpcGroup, RpcSerialization} from '@effect/rpc'
import {ConfigProvider, Layer, pipe} from 'effect'

import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {Atom, AtomRpc} from '@effect-atom/atom-react'

import {AiRpcs, MessagesRpcs} from '#rpcs/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('frontend')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerNdjson),
	// envs
	Layer.provideMerge(Layer.setConfigProvider(ConfigProvider.fromJson({})))
)

export class ApiClient extends AtomRpc.Tag<ApiClient>()('ApiClient', {
	group: RpcGroup.make().merge(AiRpcs).merge(MessagesRpcs),
	protocol: RpcClient.layerProtocolSocket({retryTransientErrors: true}).pipe(
		Layer.provide(BrowserSocket.layerWebSocket('/rpc')),
		Layer.provide(LiveLayers)
	)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, ApiClient.layer))
