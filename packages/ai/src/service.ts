import {Context, Effect, Layer, Match, flow, pipe} from 'effect'
import type {Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'

import {makeLayerPi} from './agents/pi.ts'
import type {AiError, AiLayerConfig, AiPrompt, AiStatus} from './schema.ts'

export class Ai extends Context.Service<
	Ai,
	{
		readonly status: SubscriptionRef.SubscriptionRef<AiStatus>
		readonly history: Effect.Effect<readonly Prompt.Message[]>
		readonly prompt: (input: AiPrompt) => Stream.Stream<Response.StreamPart<Toolkit.Any['tools']>, AiError>
	}
>()('@deslop/ai/service/Ai') {
	public static layer(config: AiLayerConfig) {
		return pipe(
			Match.value(config),
			Match.when({agent: 'pi'}, input => Ai.layerPi(input)),
			Match.exhaustive
		)
	}

	public static layerPi = flow(makeLayerPi, Effect.map(Ai.of), Layer.effect(this))
}
