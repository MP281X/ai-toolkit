import {Context, Layer} from 'effect'
import type {Effect, Stream, SubscriptionRef} from 'effect'

import type {AgentOptions, SessionRepo} from '@earendil-works/pi-agent-core'
import type {Models} from '@earendil-works/pi-ai'
import type {Prompt, Response, Tool, Toolkit} from 'effect/unstable/ai'

import {makePi} from './internal/pi.ts'
import type {AiAgentDefinition, AiError, AiModel, AiSessionId, AiStatus} from './schema.ts'

export declare namespace Ai {
	export type Tools = Record<string, Tool.Any>
}

export declare namespace Pi {
	export type Config<ToolSet extends Ai.Tools> = {
		agents?: AiAgentDefinition[]
		main: AiAgentDefinition
		model: AiModel
		models: Models
		options?: Omit<AgentOptions, 'initialState' | 'sessionId' | 'streamFn'>
		session?: {id?: string; repository: SessionRepo}
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
		sessionId: AiSessionId
		status: SubscriptionRef.SubscriptionRef<AiStatus>
		steer: (message: Prompt.UserMessage) => Effect.Effect<void, AiError>
	}
>()('@deslop/ai/service/Ai') {
	static override of<const Service extends Ai['Service']>(service: Service) {
		return service
	}

	static layerPi<ToolSet extends Ai.Tools>(config: Pi.Config<ToolSet>) {
		return Layer.effect(this, makePi(config))
	}
}
