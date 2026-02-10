import {Effect, Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {makeRivetServer} from '@ai-toolkit/rivet/server'

import {ai} from '#actors/ai.ts'

export class RivetServer extends Effect.Service<RivetServer>()('RivetServer', {
	accessors: true,
	effect: makeRivetServer({ai})
}) {}

export const LiveLayers = pipe(
	Layer.empty,
	// application layers
	Layer.provideMerge(AiSdk.Default),
	Layer.provideMerge(OAuth.Default),
	Layer.provideMerge(RivetServer.Default),
	// base layers
	Layer.provideMerge(OtelLayer('backend'))
)
