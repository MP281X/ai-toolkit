import {Effect, Schedule, Stream, pipe} from 'effect'

import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'

export const counterStateAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('counter.watch', void 0)),
			Stream.unwrap,
			Stream.map(event => event.state),
			Stream.retry(Schedule.spaced('250 millis'))
		)
	)
)
