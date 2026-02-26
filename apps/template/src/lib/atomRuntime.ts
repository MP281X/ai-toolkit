import {ConfigProvider, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/client'
import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {FetchHttpClient} from 'effect/unstable/http'
import {Atom, AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'

import {AiContracts} from '#rpcs/ai/contracts.ts'
import {GitContracts} from '#rpcs/git/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerNdjson),
	// application layers
	Layer.provideMerge(OAuth.layer),
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
	group: Rpc.RpcGroup.make().merge(AiContracts, GitContracts),
	protocol: Rpc.RpcClient.layerProtocolHttp({url: '/api/rpc'}).pipe(Layer.provideMerge(LiveLayers))
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, RpcClient.layer))
