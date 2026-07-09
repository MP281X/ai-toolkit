import {Effect, Stream, String, pipe} from 'effect'

import type {Response, Tool} from 'effect/unstable/ai'

import {AiError} from './schema.ts'

export function finalTextMessage<Tools extends Record<string, Tool.Any>, E, R>(
	stream: Stream.Stream<Response.StreamPart<Tools>, E, R>
) {
	return pipe(
		stream,
		Stream.runFold(
			() => '',
			(state, part) => {
				switch (part.type) {
					case 'text-delta':
						return `${state}${part.delta}`
					case 'reasoning-delta':
						return ''
					default:
						return state
				}
			}
		),
		Effect.map(String.trim),
		Effect.filterOrFail(
			message => !String.isEmpty(message),
			() => new AiError({message: 'final text message was empty'})
		)
	)
}
