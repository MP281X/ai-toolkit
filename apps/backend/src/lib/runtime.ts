import { OtelLayer } from '@ai-toolkit/opentelemetry/server'
import { BunContext } from '@effect/platform-bun'
import { Layer, Logger, ManagedRuntime, pipe } from 'effect'

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(Logger.pretty),
	Layer.provideMerge(BunContext.layer),
	Layer.provideMerge(OtelLayer('backend'))
)

export const Runtime = ManagedRuntime.make(LiveLayers)
