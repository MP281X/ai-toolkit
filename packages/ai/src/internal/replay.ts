import {Array, Chunk, Effect, Option, PubSub, Semaphore, Stream, String, pipe} from 'effect'

import {Prompt, Response} from 'effect/unstable/ai'

import type {Ai} from '#service'

type Delta = Extract<Ai.Event, {type: 'reasoning-delta' | 'text-delta'}>

type Pending = {deltas: Chunk.Chunk<string>; event: Delta}

function isUserMessage(event: Ai.Event): event is Prompt.UserMessage {
	return Prompt.isMessage(event)
}

function materialize(pending: Pending): Delta {
	const delta = Chunk.join(pending.deltas, '')
	if (pending.event.type === 'text-delta') {
		return Response.makePart('text-delta', {delta, id: pending.event.id})
	}
	return Response.makePart('reasoning-delta', {delta, id: pending.event.id})
}

export const makeReplay = Effect.fnUntraced(function* (initial: Ai.Event[]) {
	const gate = yield* Semaphore.make(1)
	const pubsub = yield* PubSub.unbounded<Ai.Event>()
	let history = Chunk.empty<Ai.Event>()
	let pending = Option.none<Pending>()

	function flush() {
		if (Option.isNone(pending)) return
		history = Chunk.append(history, materialize(pending.value))
		pending = Option.none()
	}

	function append(event: Ai.Event) {
		if (!isUserMessage(event) && (event.type === 'text-delta' || event.type === 'reasoning-delta')) {
			if (!String.isNonEmpty(event.delta)) return false
			if (Option.isSome(pending) && pending.value.event.type === event.type && pending.value.event.id === event.id) {
				pending = Option.some({...pending.value, deltas: Chunk.append(pending.value.deltas, event.delta)})
				return true
			}
			flush()
			pending = Option.some({deltas: Chunk.of(event.delta), event})
			return true
		}
		flush()
		history = Chunk.append(history, event)
		return true
	}

	for (const event of initial) append(event)

	function snapshot() {
		if (Option.isNone(pending)) return Chunk.toReadonlyArray(history)
		return Array.append(Chunk.toReadonlyArray(history), materialize(pending.value))
	}

	const publish = Effect.fnUntraced(function* (event: Ai.Event) {
		yield* Semaphore.withPermit(gate)(
			Effect.gen(function* () {
				if (!append(event)) return
				yield* PubSub.publish(pubsub, event)
			})
		)
	})

	const events = Stream.unwrap(
		pipe(
			Effect.gen(function* () {
				const subscription = yield* PubSub.subscribe(pubsub)
				return Stream.concat(Stream.fromIterable(snapshot()), Stream.fromSubscription(subscription))
			}),
			Semaphore.withPermit(gate)
		)
	)

	yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

	return {events, publish}
})
