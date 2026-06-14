import {Array, Context, Effect, Layer, Match, Option, flow, pipe} from 'effect'
import type {Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {makeLayerPi} from './agents/pi.ts'
import type {AgentCommandProfileId, AgentCommandRequest, AgentLayerConfig, AgentPrompt, AgentStatus} from './schema.ts'
import {AgentCommandProfile, AiError} from './schema.ts'

export class Agent extends Context.Service<
	Agent,
	{
		readonly status: SubscriptionRef.SubscriptionRef<AgentStatus>
		readonly history: Effect.Effect<readonly Prompt.Message[]>
		readonly prompt: (input: AgentPrompt) => Stream.Stream<Response.StreamPart<Toolkit.Any['tools']>, AiError>
	}
>()('@deslop/ai/service/Agent') {
	public static layer(config: AgentLayerConfig) {
		return pipe(Match.value(config), Match.when({agent: 'pi'}, Agent.layerPi), Match.exhaustive)
	}

	public static layerPi = flow(makeLayerPi, Effect.map(Agent.of), Layer.effect(this))
}

const agentCommandProfiles = [
	new AgentCommandProfile({icon: 'opencode', id: 'opencode-gpt-5.5', label: 'opencode'}),
	new AgentCommandProfile({icon: 'codex', id: 'codex-gpt-5.5-low', label: 'codex'}),
	new AgentCommandProfile({icon: 'pi', id: 'pi-gpt-5.5-low', label: 'pi'}),
	new AgentCommandProfile({icon: 'claude', id: 'claude-code-opus-4.8-bypass', label: 'claude'})
] as const

function commandForProfile(id: AgentCommandProfileId, cwd: string) {
	if (id === 'opencode-gpt-5.5') {
		return ChildProcess.make('opencode', ['--model', 'openai/gpt-5.5'], {
			cwd,
			env: {OPENCODE_PERMISSION: '"allow"'},
			extendEnv: true
		})
	}
	if (id === 'codex-gpt-5.5-low') {
		return ChildProcess.make(
			'codex',
			['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--dangerously-bypass-approvals-and-sandbox'],
			{cwd}
		)
	}
	if (id === 'claude-code-opus-4.8-bypass') {
		return ChildProcess.make('claude', ['--model', 'claude-opus-4-8', '--permission-mode', 'bypassPermissions'], {cwd})
	}

	return ChildProcess.make('pi', ['--provider', 'openai-codex', '--model', 'gpt-5.5:low'], {cwd})
}

export class AgentCommand extends Context.Service<AgentCommand>()('@deslop/ai/service/AgentCommand', {
	make: Effect.succeed({
		command: Effect.fn('AgentCommand.command')(function* (input: AgentCommandRequest) {
			const profile = Array.findFirst(agentCommandProfiles, candidate => candidate.id === input.profileId)
			if (Option.isNone(profile)) {
				return yield* new AiError({message: `Unknown agent command profile: ${input.profileId}`})
			}

			return commandForProfile(profile.value.id, input.cwd)
		}),
		profiles: Effect.succeed(Array.fromIterable(agentCommandProfiles))
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
