import {Array, Effect, Encoding, flow, Predicate, PubSub, pipe, Ref, Stream, String} from 'effect'

import type {Tool} from 'effect/unstable/ai'
import {Prompt, Response} from 'effect/unstable/ai'

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
				case 'text-delta':
				case 'reasoning-delta':
					if (String.isEmpty(part.delta)) return
					return part
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

export function partsStreamReducer<A extends Prompt.Message | Response.StreamPart<Record<string, Tool.Any>>, E, R>(
	parts: Stream.Stream<A, E, R>
) {
	return Stream.scan(parts, Array.empty<A>(), (acc, part) => {
		if (Prompt.isMessage(part)) return [...acc, part]
		if (part.type === 'reasoning-start' || part.type === 'reasoning-end') return acc
		if (part.type === 'text-start' || part.type === 'text-end') return acc
		if (part.type === 'tool-params-start' || part.type === 'tool-params-end') return acc
		if (part.type === 'tool-params-delta') return acc

		if (!Array.isArrayNonEmpty(acc)) return [part]
		const [parts, lastPart] = Array.unappend(acc)
		if (Prompt.isMessage(lastPart)) return [...acc, part]

		if (part.type === 'text-delta' && lastPart.type === 'text-delta') {
			return [...parts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
		}
		if (part.type === 'reasoning-delta' && lastPart.type === 'reasoning-delta') {
			return [...parts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
		}

		return [...acc, part]
	})
}

export const makeFileParts = flow(
	(files: readonly File[]) => files,
	Effect.forEach(
		Effect.fnUntraced(function* (file) {
			const data = yield* Effect.promise(async () => new Uint8Array(await file.arrayBuffer()))
			return Prompt.makePart('file', {
				mediaType: file.type,
				fileName: file.name,
				data: `data:${file.type};base64,${Encoding.encodeBase64(data)}`
			})
		}),
		{concurrency: 'unbounded'}
	)
)
