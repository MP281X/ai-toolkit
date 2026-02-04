import {ConfigProvider, Layer, ManagedRuntime, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'

const LiveEnvs = pipe(
	ConfigProvider.fromJson({
		AI_OPENCODE_ZEN: process.env['AI_OPENCODE_ZEN']
	}),
	Layer.setConfigProvider
)

export const LiveLayers = pipe(
	Layer.scope,
	// application layers
	Layer.provideMerge(AiSdk.Default),
	// base layers
	Layer.provideMerge(LiveEnvs)
)

export const ServerRuntime = ManagedRuntime.make(LiveLayers)
