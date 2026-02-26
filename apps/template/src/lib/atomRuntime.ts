import {FetchHttpClient} from '@effect/platform'
import * as Rpc from '@effect/rpc'
import {ConfigProvider, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/client'
import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {Atom, AtomRpc} from '@effect-atom/atom-react'

import {AiContracts} from '#rpcs/ai/contracts.ts'
import {GitContracts} from '#rpcs/git/contracts.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerNdjson),
	// application layers
	Layer.provideMerge(OAuth.Default),
	// envs
	Layer.provideMerge(
		Layer.setConfigProvider(
			ConfigProvider.fromJson({
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL']
			})
		)
	)
)

export class RpcClient extends AtomRpc.Tag<RpcClient>()('ApiClient', {
	group: Rpc.RpcGroup.make().merge(AiContracts, GitContracts),
	protocol: Layer.provideMerge(Rpc.RpcClient.layerProtocolHttp({url: '/api/rpc'}), LiveLayers)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, RpcClient.layer))
