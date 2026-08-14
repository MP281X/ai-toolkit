// fallow-ignore-file circular-dependency -- Service modules own implementation constructor dispatch.
import {Context, Match, pipe} from 'effect'
import type {Effect, Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Tool, Toolkit} from 'effect/unstable/ai'

import {makePi} from './internal/pi.ts'
import type {AiAgent, AiError, AiModel, AiStatus} from './schema.ts'

export declare namespace Ai {
	export type Tools = Record<string, Tool.Any>

	export type Config<ToolSet extends Tools> = {
		agent: AiAgent
		cwd: string
		model: AiModel
		systemPrompt: Prompt.SystemMessage
		toolkit: Toolkit.Toolkit<ToolSet>
	}
}

export class Ai extends Context.Service<
	Ai,
	{
		history: SubscriptionRef.SubscriptionRef<Prompt.Message[]>
		model: SubscriptionRef.SubscriptionRef<AiModel>
		prompt: (message: Prompt.UserMessage) => Stream.Stream<Response.StreamPart<Ai.Tools>, AiError>
		queue: (message: Prompt.UserMessage) => Effect.Effect<void, AiError>
		status: SubscriptionRef.SubscriptionRef<AiStatus>
		steer: (message: Prompt.UserMessage) => Effect.Effect<void, AiError>
	}
>()('@deslop/ai/service/Ai') {
	static override of<const Service extends Ai['Service']>(service: Service) {
		return service
	}

	static make<ToolSet extends Ai.Tools>(config: Ai.Config<ToolSet>) {
		return pipe(
			Match.value(config.agent),
			Match.when('pi', () => makePi(config)),
			Match.exhaustive
		)
	}
}
