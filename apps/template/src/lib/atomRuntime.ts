import {FetchHttpClient} from '@effect/platform'
import {RpcClient, RpcGroup, RpcSerialization} from '@effect/rpc'
import {ConfigProvider, Layer, pipe} from 'effect'

import {Atom, AtomRpc} from '@effect-atom/atom-react'

import {AiRpcs} from '#rpcs/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerNdjson),
	// envs
	Layer.provideMerge(Layer.setConfigProvider(ConfigProvider.fromJson({})))
)

export class ConvexRpc extends AtomRpc.Tag<ConvexRpc>()('ConvexRpc', {
	disableTracing: true,
	group: RpcGroup.make().merge(AiRpcs),
	protocol: Layer.provideMerge(RpcClient.layerProtocolHttp({url: import.meta.env['VITE_CONVEX_SITE_URL']}), LiveLayers)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, ConvexRpc.layer))
