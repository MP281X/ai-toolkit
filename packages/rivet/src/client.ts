import {Config, Effect} from 'effect'

import type {Registry} from 'rivetkit'
import {type ActorAccessor, createClient} from 'rivetkit/client'

export const makeRivetClient = Effect.fnUntraced(function* <T extends Registry<any>>() {
	const client = createClient<T>({endpoint: yield* Config.string('RIVET_ENDPOINT')})

	type client = typeof client
	return client as {[K in keyof client as client[K] extends ActorAccessor<any> ? K : never]: client[K]}
})
