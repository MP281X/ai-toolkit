import {Array, Duration, Predicate, pipe, Schema, Stream, String} from 'effect'

import {Prompt, Response, Tool, Toolkit} from 'effect/unstable/ai'

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
	return pipe(
		parts,
		Stream.scan(Array.empty<A>(), (acc, part) => {
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
		}),
		Stream.debounce(Duration.millis(20))
	)
}

// ---- Tools ----

export const WebSearch = Tool.make('WebSearch', {
	description: 'Search the web for recent, relevant sources and return concise page content snippets.',
	parameters: Schema.Struct({
		query: Schema.NonEmptyString,
		numResults: Schema.optional(Schema.Number)
	}),
	success: Schema.Array(
		Schema.Struct({
			title: Schema.NullOr(Schema.NonEmptyString),
			url: Schema.NonEmptyString,
			text: Schema.NonEmptyString,
			highlights: Schema.Array(Schema.String)
		})
	)
})

export const ToolKit = Toolkit.make(WebSearch)
