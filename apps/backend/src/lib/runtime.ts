import { AiClient } from '@ai-toolkit/ai/ai-sdk'
import { OtelLayer } from '@ai-toolkit/opentelemetry/server'
import { BunContext } from '@effect/platform-bun'
import { Layer, Logger, ManagedRuntime, pipe } from 'effect'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(Logger.pretty),
	Layer.provideMerge(BunContext.layer),
	Layer.provideMerge(OtelLayer('backend')),
	// application layers
	Layer.provideMerge(AiClient.Default)
)

export const Runtime = ManagedRuntime.make(LiveLayers)
