import {Context, Match, pipe} from 'effect'
import type {Effect, Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Tool, Toolkit} from 'effect/unstable/ai'

import {makePi} from './internal/pi.ts'
import type {AiAgent, AiError, AiModel, AiStatus} from './schema.ts'

export declare namespace Ai {
	export type Tools = Record<string, Tool.Any>

	export type Config<ToolSet extends Tools> = {
		readonly agent: AiAgent
		readonly cwd: string
		readonly model: AiModel
		readonly systemPrompt: Prompt.SystemMessage
		readonly toolkit: Toolkit.Toolkit<ToolSet>
	}
}

export class Ai extends Context.Service<
	Ai,
	{
		readonly history: SubscriptionRef.SubscriptionRef<readonly Prompt.Message[]>
		readonly model: SubscriptionRef.SubscriptionRef<AiModel>
		readonly prompt: (message: Prompt.UserMessage) => Stream.Stream<Response.StreamPart<Ai.Tools>, AiError>
		readonly queue: (message: Prompt.UserMessage) => Effect.Effect<void, AiError>
		readonly status: SubscriptionRef.SubscriptionRef<AiStatus>
		readonly steer: (message: Prompt.UserMessage) => Effect.Effect<void, AiError>
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
