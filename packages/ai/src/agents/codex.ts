import {Array, Cause, Effect, Predicate, pipe, Stream} from 'effect'

import type {ThreadEvent, ThreadItem} from '@openai/codex-sdk'
import {Codex} from '@openai/codex-sdk'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

import type {AgentToolKit} from '#tools/contracts.ts'
import {Agent} from '../service.ts'

type StreamPart = Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>

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

function itemToStreamPart(item: ThreadItem) {
	if (item.type === 'agent_message' && item.text) {
		return Response.makePart('text-delta', {delta: item.text, id: item.id})
	}
	if (item.type === 'reasoning' && item.text) {
		return Response.makePart('reasoning-delta', {delta: item.text, id: item.id})
	}
	if (item.type === 'command_execution' && item.status !== 'in_progress') {
		return Response.makePart('tool-result', {
			encodedResult: item.aggregated_output,
			id: item.id,
			isFailure: item.status === 'failed',
			name: 'command_execution',
			preliminary: false,
			providerExecuted: false,
			result: item.aggregated_output
		})
	}
	if (item.type === 'mcp_tool_call' && item.status !== 'in_progress') {
		return Response.makePart('tool-result', {
			encodedResult: item.status === 'failed' ? item.error?.message : item.result,
			id: item.id,
			isFailure: item.status === 'failed',
			name: item.tool,
			preliminary: false,
			providerExecuted: false,
			result: item.status === 'failed' ? item.error?.message : item.result
		})
	}
	if (item.type === 'error') return Response.makePart('error', {error: item.message})
}

function eventToStreamParts(event: ThreadEvent) {
	const parts = Array.empty<StreamPart>()
	if (event.type === 'item.completed') {
		const streamPart = itemToStreamPart(event.item)
		if (streamPart) parts.push(streamPart)
		return parts
	}
	if (event.type === 'turn.completed') {
		parts.push(
			Response.makePart('finish', {
				metadata: {},
				reason: 'stop',
				response: undefined,
				usage: {
					inputTokens: {
						cacheRead: event.usage.cached_input_tokens,
						cacheWrite: 0,
						uncached: event.usage.input_tokens - event.usage.cached_input_tokens,
						total: event.usage.input_tokens
					},
					outputTokens: {
						reasoning: event.usage.reasoning_output_tokens,
						text: event.usage.output_tokens - event.usage.reasoning_output_tokens,
						total: event.usage.output_tokens
					}
				}
			})
		)
		return parts
	}
	if (event.type === 'turn.failed') parts.push(Response.makePart('error', {error: event.error.message}))
	if (event.type === 'error') parts.push(Response.makePart('error', {error: event.message}))
	return parts
}

export const makeLayerCodex = Effect.gen(function* () {
	const codex = new Codex()
	const thread = codex.startThread()

	return Agent.of({
		history: Effect.succeed([]),
		streamText: input =>
			pipe(
				Effect.promise(() => thread.runStreamed(promptText(input.messages))),
				Stream.fromEffect,
				Stream.flatMap(result => Stream.fromAsyncIterable(result.events, Cause.die)),
				Stream.flatMap(event =>
					Stream.fromIterable(pipe(eventToStreamParts(event), Array.filter(Predicate.isNotUndefined)))
				),
				Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)})))
			)
	})
})
