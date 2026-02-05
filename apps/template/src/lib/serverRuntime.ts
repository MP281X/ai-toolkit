import {HttpServer} from '@effect/platform'
import {RpcSerialization} from '@effect/rpc'
import {ConfigProvider, DefaultServices, Layer, ManagedRuntime, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'

export const LiveLayers = pipe(
	Layer.succeedContext(DefaultServices.liveServices),
	// application layers
	Layer.provideMerge(AiSdk.Default),
	// base layers
	Layer.provideMerge(HttpServer.layerContext),
	Layer.provideMerge(RpcSerialization.layerNdjson),
	// envs
	Layer.provideMerge(
		Layer.setConfigProvider(
			ConfigProvider.fromJson({
				AI_OPENCODE_ZEN: process.env['AI_OPENCODE_ZEN'],
				AI_EXA_API_KEY: process.env['AI_EXA_API_KEY']
			})
		)
	)
)

export const ServerRuntime = ManagedRuntime.make(LiveLayers)
