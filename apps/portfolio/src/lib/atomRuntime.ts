import {Config, ConfigProvider, Effect, Layer, Option, pipe} from 'effect'

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
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({
				// oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vite exposes env values through an index signature.
				VITE_OTEL_URL: import.meta.env['VITE_OTEL_URL'],
				// oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vite exposes env values through an index signature.
				VITE_PORTLESS_BASE_ORIGIN: import.meta.env['VITE_PORTLESS_BASE_ORIGIN'],
				// oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vite exposes env values through an index signature.
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
					Effect.map(config =>
						pipe(
							config.base,
							Option.map(baseOrigin => {
								const url = new URL(baseOrigin)
								url.hostname = `server.${url.hostname}`

								return url.origin
							}),
							Option.orElse(() =>
								Option.map(config.origin, origin => {
									const url = new URL(origin)
									url.hostname = ['server', ...url.hostname.split('.').slice(1)].join('.')

									return url.origin
								})
							),
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
