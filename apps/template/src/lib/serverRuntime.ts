import {Layer, ManagedRuntime, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('server')),
	// application layers
	Layer.provideMerge(AiSdk.Default)
)

export const ServerRuntime = ManagedRuntime.make(LiveLayers)
