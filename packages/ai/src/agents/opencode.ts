import {Array, Cause, Effect, Predicate, pipe, Stream} from 'effect'

import type {Part} from '@opencode-ai/sdk/v2'
import {createOpencode} from '@opencode-ai/sdk/v2'
import type {Prompt} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import {Agent} from '../service.ts'

function promptText(messages: readonly Prompt.Message[]) {
	const text = []
	for (const message of messages) {
		if (Predicate.isString(message.content)) {
			text.push(message.content)
			continue
		}
		for (const part of message.content) {
			if (part.type === 'text') text.push(part.text)
		}
	}
	return text.join('\n')
}

function partToStreamPart(part: Part) {
	if (part.type === 'text' && part.text) return Response.makePart('text-delta', {delta: part.text, id: part.id})
	if (part.type === 'reasoning' && part.text) {
		return Response.makePart('reasoning-delta', {delta: part.text, id: part.id})
	}
	if (part.type === 'tool' && part.state.status === 'completed') {
		return Response.makePart('tool-result', {
			encodedResult: part.state.output,
			id: part.callID,
			isFailure: false,
			name: part.tool,
			preliminary: false,
			providerExecuted: false,
			result: part.state.output
		})
	}
	if (part.type === 'tool' && part.state.status === 'error') {
		return Response.makePart('tool-result', {
			encodedResult: part.state.error,
			id: part.callID,
			isFailure: true,
			name: part.tool,
			preliminary: false,
			providerExecuted: false,
			result: part.state.error
		})
	}
}

export const makeLayerOpencode = Effect.gen(function* () {
	const opencode = yield* pipe(
		Effect.promise(() => createOpencode()),
		Effect.orDie
	)
	const session = yield* pipe(
		Effect.promise(() => opencode.client.session.create({})),
		Effect.flatMap(result => (result.data ? Effect.succeed(result.data) : Effect.die(result.error))),
		Effect.orDie
	)

	return Agent.of({
		history: Effect.succeed([]),
		streamText: input =>
			pipe(
				Effect.promise(() =>
					opencode.client.session.prompt({
						model: {modelID: input.model, providerID: input.provider},
						parts: [{text: promptText(input.messages), type: 'text'}],
						sessionID: session.id
					})
				),
				Effect.map(result => result.data?.parts ?? []),
				Effect.orDie,
				Stream.fromEffect,
				Stream.flatMap(parts =>
					Stream.fromIterable(
						pipe(
							parts,
							Array.flatMap(part => {
								const streamPart = partToStreamPart(part)
								return streamPart ? [streamPart] : []
							})
						)
					)
				),
				Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)})))
			)
	})
})
