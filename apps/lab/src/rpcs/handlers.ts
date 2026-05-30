import {Cause, Context, Duration, Effect, FiberHandle, Layer, RcMap, Stream, SubscriptionRef, pipe} from 'effect'

import {Prompt, Response} from 'effect/unstable/ai'

import {RpcContracts} from '#rpcs/contracts.ts'
import type {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import type {AgentEvent} from '@ai-toolkit/ai/schema'
import {AgentKey} from '@ai-toolkit/ai/schema'
import {Agent} from '@ai-toolkit/ai/service'
import {makeResumableStream} from '@ai-toolkit/ai/utils'

const systemPrompt = Prompt.makeMessage('system', {content: 'You are running inside @ai-toolkit/lab.'})

const AgentSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(10),
	lookup: Effect.fnUntraced(function* (key: AgentKey) {
		const context = yield* pipe(
			Layer.buildWithScope(Agent.layer({agent: key.agent, cwd: key.cwd, systemPrompt}), yield* Effect.scope),
			Effect.catchTag('ConfigError', Effect.die)
		)
		const agent = Context.get(context, Agent)
		const handle = yield* FiberHandle.make<void, never>()
		const stream = yield* makeResumableStream<AgentEvent>()
		const prompt = Effect.fnUntraced(function* (input: {
			readonly model: ModelId
			readonly prompt: string
			readonly provider: ProviderId
		}) {
			yield* stream.append({prompt: input.prompt, type: 'user-message'})
			yield* FiberHandle.run(
				handle,
				pipe(
					agent.streamText({
						messages: [Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: input.prompt})]})],
						model: input.model,
						provider: input.provider
					}),
					Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)}))),
					Stream.map(part => ({part, type: 'agent-part'}) satisfies AgentEvent),
					Stream.tap(stream.append),
					Stream.runDrain
				)
			)
		})

		return {events: stream.stream, prompt, status: agent.status, stop: FiberHandle.clear(handle)} as const
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const agents = yield* AgentSessions

		return RpcContracts.of({
			'agent.create': payload => {
				const key = new AgentKey({agent: payload.agent, cwd: payload.cwd, id: `agent-${crypto.randomUUID()}`})
				return pipe(RcMap.get(agents, key), Effect.as(key))
			},
			'agent.events': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(agents, payload.key),
						Effect.map(session => session.events)
					)
				),
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				yield* pipe(
					RcMap.get(agents, payload.key),
					Effect.flatMap(session => session.prompt(payload))
				)
			}),
			'agent.status': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const session = yield* RcMap.get(agents, payload.key)
						const status = yield* SubscriptionRef.get(session.status)

						return Stream.concat(Stream.drop(1)(SubscriptionRef.changes(session.status)))(Stream.make(status))
					})
				),
			'agent.stop': Effect.fnUntraced(function* (payload) {
				yield* pipe(
					RcMap.get(agents, payload.key),
					Effect.flatMap(session => session.stop)
				)
			}),
			'lab.cwd': () => Effect.sync(() => process.env['INIT_CWD'] ?? process.cwd())
		})
	})
)
