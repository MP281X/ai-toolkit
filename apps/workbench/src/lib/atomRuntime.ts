import {Config, ConfigProvider, Effect, Layer, Option, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {AtomRpc} from 'effect/unstable/reactivity'
import * as Rpc from 'effect/unstable/rpc'
import {Socket} from 'effect/unstable/socket'

import {RpcContracts} from '#rpcs/contracts.ts'
import {OtelLayer} from '@deslop/opentelemetry/client'

function portlessServiceOrigin(baseOrigin: string, service: string) {
	const url = new URL(baseOrigin)
	url.hostname = `${service}.${url.hostname}`
	return url.origin
}

function portlessServerOrigin(origin: string) {
	const url = new URL(origin)
	const [, ...labels] = url.hostname.split('.')
	url.hostname = ['server', ...labels].join('.')
	return url.origin
}

export const LiveLayers = pipe(
	Layer.empty,
	// Base layers
	Layer.provideMerge(OtelLayer('workbench-client')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(Rpc.RpcSerialization.layerMsgPack),
	// Envs
	Layer.provideMerge(
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL'],
				VITE_PORTLESS_BASE_ORIGIN: import.meta.env['VITE_PORTLESS_BASE_ORIGIN'],
				VITE_PORTLESS_ORIGIN: import.meta.env['VITE_PORTLESS_ORIGIN']
			})
		)
	)
)

export class RpcClient extends AtomRpc.Service<RpcClient>()('ApiClient', {
	group: RpcContracts,
	protocol: pipe(
		Rpc.RpcClient.layerProtocolSocket({retryTransientErrors: true}),
		Layer.provideMerge(
			Socket.layerWebSocket(
				pipe(
					Effect.all({
						base: Config.option(Config.string('VITE_PORTLESS_BASE_ORIGIN')),
						origin: Config.option(Config.string('VITE_PORTLESS_ORIGIN'))
					}),
					Effect.map(({base, origin}) =>
						pipe(
							base,
							Option.map(baseOrigin => portlessServiceOrigin(baseOrigin, 'server')),
							Option.orElse(() => Option.map(origin, portlessServerOrigin)),
							Option.match({
								onNone: () => `${location.origin}/api/rpc`,
								onSome: serverOrigin => `${serverOrigin}/api/rpc`
							})
						)
					),
					Effect.orDie
				)
			)
		),
		Layer.provideMerge(Socket.layerWebSocketConstructorGlobal),
		Layer.provideMerge(LiveLayers)
	)
}) {}
