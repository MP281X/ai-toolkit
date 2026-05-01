import {Effect, Predicate, PubSub, pipe, Ref, Stream, String} from 'effect'

import type {Tool} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

export const makeResumableStream = Effect.fnUntraced(function* <A>() {
	const history = yield* Ref.make<readonly A[]>([])
	const pubsub = yield* PubSub.unbounded<A>()

	return {
		append: Effect.fnUntraced(function* (part: A) {
			yield* Ref.update(history, parts => [...parts, part])
			yield* PubSub.publish(pubsub, part)
		}),
		stream: Stream.concat(Stream.fromIterableEffect(Ref.get(history)), Stream.fromPubSub(pubsub))
	}
})

export function partsStreamSanitizer<A extends Response.StreamPart<Record<string, Tool.Any>>, E, R>(
	parts: Stream.Stream<A, E, R>
) {
	return pipe(
		parts,
		Stream.map(part => {
			switch (part.type) {
				case 'reasoning-start':
				case 'reasoning-end':
				case 'text-start':
				case 'text-end':
				case 'tool-params-start':
				case 'tool-params-end':
				case 'tool-params-delta':
					return
				case 'text-delta':
				case 'reasoning-delta': {
					if (String.isEmpty(part.delta)) return
					if (part.delta === '[REDACTED]') return
					return part
				}
				case 'response-metadata':
					return Response.makePart('response-metadata', {
						id: part.id,
						modelId: part.modelId,
						timestamp: part.timestamp,
						request: undefined,
						metadata: part.metadata
					})
				case 'finish':
					return Response.makePart('finish', {
						reason: part.reason,
						usage: part.usage,
						response: undefined,
						metadata: part.metadata
					})
				default:
					return part
			}
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}
