import {Array, Cause, DateTime, Effect, pipe, Stream, SubscriptionRef} from 'effect'

import {Codex} from '@openai/codex-sdk'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {AiError, Response} from 'effect/unstable/ai'

import {partsStreamSanitizer, serializeAiPartToMarkdown} from '#lib/utils.ts'
import type {AgentToolKit} from '#tools/contracts.ts'
import {Agent} from '../service.ts'

type StreamPart = Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>

export const makeLayerCodex = Effect.fnUntraced(function* (config: {
	readonly sessionId?: string
	readonly systemPrompt: Prompt.SystemMessage
}) {
	const thread = config.sessionId
		? new Codex().resumeThread(config.sessionId, {
				model: undefined,
				sandboxMode: 'workspace-write',
				workingDirectory: process.cwd()
			})
		: new Codex().startThread({
				model: undefined,
				sandboxMode: 'workspace-write',
				workingDirectory: process.cwd()
			})
	const status = yield* SubscriptionRef.make<{
		readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
		readonly updatedAt: DateTime.Utc
	}>({state: 'idle', updatedAt: yield* DateTime.now})

	return Agent.of({
		status,
		streamText: input =>
			Stream.suspend(() => {
				let finalState: 'idle' | 'error' = 'idle'

				return pipe(
					Stream.unwrap(
						pipe(
							DateTime.now,
							Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: 'running', updatedAt} as const)),
							Effect.flatMap(() =>
								Effect.promise(() =>
									thread.runStreamed(
										`${config.systemPrompt.content}\n\n${serializeAiPartToMarkdown(input.messages).markdown}`
									)
								)
							),
							Effect.map(response => Stream.fromAsyncIterable(response.events, Cause.die))
						)
					),
					Stream.flatMap(event => {
						if (event.type === 'item.completed' && event.item.type === 'agent_message' && event.item.text) {
							return Stream.make(Response.makePart('text-delta', {delta: event.item.text, id: event.item.id}))
						}

						if (event.type === 'item.completed' && event.item.type === 'reasoning' && event.item.text) {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('reasoning-delta', {delta: event.item.text, id: event.item.id})
							)
						}

						if (event.type === 'item.started' && event.item.type === 'command_execution') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-call', {
									id: event.item.id,
									name: 'command_execution',
									params: {command: event.item.command},
									providerExecuted: true
								})
							)
						}

						if (event.type === 'item.completed' && event.item.type === 'command_execution') {
							const isFailure = event.item.status === 'failed' || event.item.exit_code !== 0
							const result = isFailure
								? new AiError.UnknownError({description: event.item.aggregated_output})
								: {output: event.item.aggregated_output}
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-result', {
									encodedResult: result,
									id: event.item.id,
									isFailure,
									name: 'command_execution',
									preliminary: false,
									providerExecuted: true,
									result
								})
							)
						}

						if (event.type === 'item.started' && event.item.type === 'file_change') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-call', {
									id: event.item.id,
									name: 'file_change',
									params: {changes: event.item.changes},
									providerExecuted: true
								})
							)
						}

						if (event.type === 'item.completed' && event.item.type === 'file_change') {
							const result =
								event.item.status === 'failed'
									? new AiError.UnknownError({description: 'file change failed'})
									: {changes: event.item.changes}
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-result', {
									encodedResult: result,
									id: event.item.id,
									isFailure: event.item.status === 'failed',
									name: 'file_change',
									preliminary: false,
									providerExecuted: true,
									result
								})
							)
						}

						if (event.type === 'item.started' && event.item.type === 'mcp_tool_call') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-call', {
									id: event.item.id,
									name: 'mcp_tool_call',
									params: {server: event.item.server, tool: event.item.tool},
									providerExecuted: true
								})
							)
						}

						if (event.type === 'item.completed' && event.item.type === 'mcp_tool_call') {
							const result =
								event.item.status === 'failed'
									? new AiError.UnknownError({description: event.item.error?.message ?? 'MCP tool call failed'})
									: {server: event.item.server, text: JSON.stringify(event.item.result), tool: event.item.tool}
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-result', {
									encodedResult: result,
									id: event.item.id,
									isFailure: event.item.status === 'failed',
									name: 'mcp_tool_call',
									preliminary: false,
									providerExecuted: true,
									result
								})
							)
						}

						if (event.type === 'item.started' && event.item.type === 'web_search') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-call', {
									id: event.item.id,
									name: 'web_search',
									params: {query: event.item.query},
									providerExecuted: true
								})
							)
						}

						if (event.type === 'item.completed' && event.item.type === 'web_search') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-result', {
									encodedResult: {query: event.item.query, results: []},
									id: event.item.id,
									isFailure: false,
									name: 'web_search',
									preliminary: false,
									providerExecuted: true,
									result: {query: event.item.query, results: []}
								})
							)
						}

						if (event.type === 'item.started' && event.item.type === 'todo_list') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-call', {
									id: event.item.id,
									name: 'todo_list',
									params: {items: event.item.items},
									providerExecuted: true
								})
							)
						}

						if (event.type === 'item.completed' && event.item.type === 'todo_list') {
							return Stream.make<readonly [StreamPart]>(
								Response.makePart('tool-result', {
									encodedResult: {items: event.item.items},
									id: event.item.id,
									isFailure: false,
									name: 'todo_list',
									preliminary: false,
									providerExecuted: true,
									result: {items: event.item.items}
								})
							)
						}

						if (event.type === 'turn.completed') {
							return Stream.make(
								Response.makePart('finish', {
									metadata: {},
									reason: 'stop',
									response: undefined,
									usage: new Response.Usage({
										inputTokens: {
											cacheRead: event.usage.cached_input_tokens,
											cacheWrite: undefined,
											total: event.usage.input_tokens,
											uncached: event.usage.input_tokens - event.usage.cached_input_tokens
										},
										outputTokens: {
											reasoning: event.usage.reasoning_output_tokens,
											text: event.usage.output_tokens - event.usage.reasoning_output_tokens,
											total: event.usage.output_tokens
										}
									})
								})
							)
						}

						if (event.type === 'turn.failed')
							return Stream.make<readonly [StreamPart]>(Response.makePart('error', {error: event.error.message}))
						if (event.type === 'error')
							return Stream.make<readonly [StreamPart]>(Response.makePart('error', {error: event.message}))

						return Stream.fromIterable(Array.empty<StreamPart>())
					}),
					partsStreamSanitizer,
					Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)}))),
					Stream.tap(part => Effect.sync(() => (finalState = part.type === 'error' ? 'error' : finalState))),
					Stream.ensuring(
						pipe(
							DateTime.now,
							Effect.flatMap(updatedAt => SubscriptionRef.set(status, {state: finalState, updatedAt} as const))
						)
					)
				)
			})
	})
})
