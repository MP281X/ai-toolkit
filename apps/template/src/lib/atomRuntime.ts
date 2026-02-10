import {FetchHttpClient} from '@effect/platform'
import {ConfigProvider, Effect, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/client'
import {OtelLayer} from '@ai-toolkit/opentelemetry/client'
import {makeRivetClient} from '@ai-toolkit/rivet/client'
import {Atom} from '@effect-atom/atom-react'

import type {RivetServer} from './serverRuntime.ts'

export class Rivet extends Effect.Service<Rivet>()('Rivet', {
	accessors: true,
	effect: makeRivetClient<Effect.Effect.Success<(typeof RivetServer)['server']>>()
}) {}

export const LiveLayers = pipe(
	Layer.empty,
	// base layers
	Layer.provideMerge(OtelLayer('client')),
	Layer.provideMerge(FetchHttpClient.layer),
	// application layers
	Layer.provideMerge(Rivet.Default),
	Layer.provideMerge(OAuth.Default),
	// envs
	Layer.provideMerge(
		Layer.setConfigProvider(
			ConfigProvider.fromJson({
				AUTH_BASE_URL: import.meta.env['VITE_AUTH_BASE_URL'],
				RIVET_ENDPOINT: import.meta.env['VITE_RIVET_ENDPOINT']
			})
		)
	)
)

export const AtomRuntime = Atom.runtime(LiveLayers)
