import { Rpcs } from '@ai-toolkit/backend/rpcs'
import { OtelLayer } from '@ai-toolkit/opentelemetry/client'
import { BrowserSocket } from '@effect/platform-browser'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { Atom, AtomRpc } from '@effect-atom/atom-react'
import { Config, ConfigProvider, Effect, Layer, pipe, Record } from 'effect'

const LiveEnvs = pipe(
	ConfigProvider.fromMap(new Map(Record.toEntries(import.meta.env)), { pathDelim: '_' }),
	ConfigProvider.nested('VITE'),
	Layer.setConfigProvider
)

const SocketLayer = Config.url('BACKEND_URL').pipe(
	Effect.map(url => {
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
		url.pathname = '/rpc'
		return url.toString()
	}),
	Effect.map(BrowserSocket.layerWebSocket),
	Layer.unwrapEffect
)

export class ApiClient extends AtomRpc.Tag<ApiClient>()('ApiClient', {
	group: Rpcs,
	protocol: RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
		Layer.provide(SocketLayer),
		Layer.provide(RpcSerialization.layerNdjson),
		Layer.provide(LiveEnvs)
	)
}) {}

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(OtelLayer('frontend')),
	Layer.provideMerge(ApiClient.layer),
	Layer.provideMerge(LiveEnvs)
)

export const AtomRuntime = Atom.runtime(LiveLayers)
