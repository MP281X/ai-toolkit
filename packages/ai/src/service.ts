import type {Stream, SubscriptionRef} from 'effect'
import {Context, Effect, Layer, Match, flow, pipe} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'

import {makeLayerPi} from './agents/pi.ts'
import type {AgentId, ModelId, ProviderId, ThinkingLevel} from './catalog.ts'
import type {AiError, AgentStatus} from './schema.ts'

export type AgentPrompt = {
	readonly messages: readonly Prompt.Message[]
	readonly model: ModelId
	readonly provider: ProviderId
	readonly thinkingLevel?: ThinkingLevel
}

export type AgentLayerConfig = {
	readonly agent: AgentId
	readonly cwd: string
	readonly systemPrompt: Prompt.SystemMessage
	readonly tools?: 'all' | 'none' | readonly string[]
}

export class Agent extends Context.Service<
	Agent,
	{
		readonly status: SubscriptionRef.SubscriptionRef<AgentStatus>
		readonly history: Effect.Effect<readonly Prompt.Message[]>
		readonly streamText: (input: AgentPrompt) => Stream.Stream<Response.StreamPart<Toolkit.Any['tools']>, AiError>
	}
>()('@deslop/ai/service/Agent') {
	public static layer(config: AgentLayerConfig) {
		return pipe(
			Match.value(config),
			Match.when({agent: 'pi'}, input => Agent.layerPi(input)),
			Match.exhaustive
		)
	}

	public static layerPi = flow(makeLayerPi, Effect.map(Agent.of), Layer.effect(this))
}
