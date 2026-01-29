import { OtelLayer } from '@ai-toolkit/opentelemetry/client'
import { FetchHttpClient } from '@effect/platform'
import { Atom } from '@effect-atom/atom-react'
import { Layer, Logger, pipe } from 'effect'

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(Logger.pretty),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(OtelLayer('frontend'))
)

export const AtomRuntime = Atom.runtime(LiveLayers)
