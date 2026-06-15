import {Array, Context, Effect, Layer, Match, flow, pipe} from 'effect'
import type {Stream, SubscriptionRef} from 'effect'

import type {Prompt, Response, Toolkit} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {makeLayerPi} from './agents/pi.ts'
import type {
	AgentCommandProfileId,
	AgentCommandRequest,
	AgentLayerConfig,
	AgentPrompt,
	AgentStatus,
	AiError
} from './schema.ts'
import {AgentCommandProfile} from './schema.ts'

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

function profileForId(id: AgentCommandProfileId) {
	switch (id) {
		case 'opencode-gpt-5.5': {
			return new AgentCommandProfile({icon: 'opencode', id, label: 'opencode'})
		}
		case 'codex-gpt-5.5-low': {
			return new AgentCommandProfile({icon: 'codex', id, label: 'codex'})
		}
		case 'pi-gpt-5.5-low': {
			return new AgentCommandProfile({icon: 'pi', id, label: 'pi'})
		}
		case 'claude-code-opus-4.8-bypass': {
			return new AgentCommandProfile({icon: 'claude', id, label: 'claude'})
		}
	}
}

function agentCommandProfiles() {
	return Array.map(
		['opencode-gpt-5.5', 'codex-gpt-5.5-low', 'pi-gpt-5.5-low', 'claude-code-opus-4.8-bypass'] as const,
		profileForId
	)
}

function commandForProfile(profile: AgentCommandProfile, cwd: string) {
	switch (profile.id) {
		case 'opencode-gpt-5.5': {
			return ChildProcess.make('opencode', ['--model', 'openai/gpt-5.5'], {
				cwd,
				env: {OPENCODE_PERMISSION: '"allow"'},
				extendEnv: true
			})
		}
		case 'codex-gpt-5.5-low': {
			return ChildProcess.make(
				'codex',
				['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--dangerously-bypass-approvals-and-sandbox'],
				{cwd}
			)
		}
		case 'pi-gpt-5.5-low': {
			return ChildProcess.make('pi', ['--provider', 'openai-codex', '--model', 'gpt-5.5:low'], {cwd})
		}
		case 'claude-code-opus-4.8-bypass': {
			return ChildProcess.make('claude', ['--model', 'claude-opus-4-8', '--permission-mode', 'bypassPermissions'], {
				cwd
			})
		}
	}
}

export class AgentCommand extends Context.Service<AgentCommand>()('@deslop/ai/service/AgentCommand', {
	make: Effect.succeed({
		create: Effect.fn('AgentCommand.create')(function* (input: AgentCommandRequest) {
			const profile = profileForId(input.profileId)
			return {command: commandForProfile(profile, input.cwd), profile}
		}),
		profiles: Effect.succeed(agentCommandProfiles())
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
