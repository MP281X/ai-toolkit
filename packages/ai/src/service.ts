import {Array, Context, Effect, Layer, Match, Option, flow, pipe} from 'effect'
import type {Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'
import type {ChildProcess} from 'effect/unstable/process'

import {makeLayerPi} from './agents/pi.ts'
import {agentCommandProfiles} from './catalog.ts'
import type {AgentCommandProfile, AgentCommandRequest, AgentLayerConfig, AgentPrompt, AgentStatus} from './schema.ts'
import {AiError, agentCommandProfileValues} from './schema.ts'

export class Agent extends Context.Service<
	Agent,
	{
		readonly status: SubscriptionRef.SubscriptionRef<AgentStatus>
		readonly history: Effect.Effect<readonly Prompt.Message[]>
		readonly prompt: (input: AgentPrompt) => Stream.Stream<Response.StreamPart<Toolkit.Any['tools']>, AiError>
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

export class AgentCommand extends Context.Service<
	AgentCommand,
	{
		readonly command: (input: AgentCommandRequest) => Effect.Effect<ChildProcess.StandardCommand, AiError>
		readonly profiles: Effect.Effect<readonly AgentCommandProfile[]>
	}
>()('@deslop/ai/service/AgentCommand', {
	make: Effect.gen(function* () {
		return {
			command(input: AgentCommandRequest) {
				const profile = Array.findFirst(agentCommandProfiles, candidate => candidate.id === input.profileId)
				if (Option.isNone(profile)) {
					return Effect.fail(new AiError({message: `Unknown agent command profile: ${input.profileId}`}))
				}

				return Effect.succeed(profile.value.command(input.cwd))
			},
			profiles: Effect.succeed<readonly AgentCommandProfile[]>(agentCommandProfileValues)
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
