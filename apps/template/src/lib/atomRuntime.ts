import {FetchHttpClient} from '@effect/platform'
import {BrowserSocket} from '@effect/platform-browser'
import * as Rpc from '@effect/rpc'
import {Config, ConfigProvider, Effect, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/client'
import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {Atom, AtomRpc} from '@effect-atom/atom-react'

import {AiContracts} from '#rpcs/ai/contracts.ts'

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
				VITE_CLIENT_URL: import.meta.env['VITE_CLIENT_URL'],
				VITE_SERVER_URL: import.meta.env['VITE_SERVER_URL'],
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL']
			})
		)
	)
)

export class RpcClient extends AtomRpc.Tag<RpcClient>()('ApiClient', {
	group: Rpc.RpcGroup.make().merge(AiContracts),
	protocol: Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}).pipe(
		Layer.provide(
			pipe(
				Config.string('VITE_SERVER_URL'),
				Effect.map(url => BrowserSocket.layerWebSocket(`${url}/api/rpc`)),
				Layer.unwrapEffect
			)
		),
		Layer.provide(LiveLayers)
	)
}) {}

export const AtomRuntime = Atom.runtime(Layer.mergeAll(LiveLayers, RpcClient.layer))
