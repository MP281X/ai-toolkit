import {Layer, pipe} from 'effect'

import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {Atom} from '@effect-atom/atom-react'

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('client'))
)

export const AtomRuntime = Atom.runtime(LiveLayers)
