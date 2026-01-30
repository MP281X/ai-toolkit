import { AiClient } from '@ai-toolkit/ai'
import { OtelLayer } from '@ai-toolkit/opentelemetry/server'
import { Layer, ManagedRuntime, pipe } from 'effect'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('backend')),
	// application layers
	Layer.provideMerge(AiClient.Default)
)

export const Runtime = ManagedRuntime.make(LiveLayers)
