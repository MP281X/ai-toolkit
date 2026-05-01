import type {Effect, Stream} from 'effect'
import {Context, Layer} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'

import type {AgentToolKit} from '#tools/contracts.ts'
import {makeLayerCodex} from './agents/codex.ts'
import {makeLayerEffect} from './agents/effect.ts'
import {makeLayerOpencode} from './agents/opencode.ts'
import type {ModelId, ProviderId} from './catalog.ts'

export class Agent extends Context.Service<
	Agent,
	{
		readonly history: Effect.Effect<readonly Prompt.Message[], never, never>
		readonly streamText: (input: {
			provider: ProviderId
			model: ModelId
			messages: Prompt.Message[]
		}) => Stream.Stream<Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>>
	}
>()('@ai-toolkit/ai/service/Agent') {
	static layerEffect = Layer.effect(this, makeLayerEffect)
	static layerOpencode = Layer.effect(this, makeLayerOpencode)
	static layerCodex = Layer.effect(this, makeLayerCodex)
}
