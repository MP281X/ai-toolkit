import type {SubscriptionRef} from 'effect'
import {
	Array,
	Context,
	DateTime,
	Effect,
	Layer,
	Match,
	Option,
	Stream,
	SubscriptionRef as SubscriptionRefService,
	flow,
	pipe
} from 'effect'

import {Response, type Prompt, type Toolkit} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {makeLayerPi} from './agents/pi.ts'
import type {AgentCommandProfileId, AgentCommandRequest, AgentLayerConfig, AgentPrompt, AgentStatus} from './schema.ts'
import {AgentCommandProfile, AiError} from './schema.ts'

type AgentMock = {
	readonly history?: readonly Prompt.Message[]
	readonly prompt?: (input: AgentPrompt) => Stream.Stream<Response.StreamPart<Toolkit.Any['tools']>, AiError>
	readonly response?: string
	readonly status?: AgentStatus
}

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
	public static layerMock(input: AgentMock = {}) {
		return Layer.effect(
			this,
			Effect.gen(function* () {
				const status = yield* SubscriptionRefService.make<AgentStatus>(
					input.status ?? {state: 'idle', updatedAt: yield* DateTime.now}
				)
				const history = yield* SubscriptionRefService.make<readonly Prompt.Message[]>(input.history ?? [])
				const setStatus = Effect.fnUntraced(function* (state: AgentStatus['state']) {
					yield* SubscriptionRefService.set(status, {state, updatedAt: yield* DateTime.now})
				})

				return {
					history: SubscriptionRefService.get(history),
					prompt: (prompt: AgentPrompt) =>
						Stream.unwrap(
							Effect.gen(function* () {
								yield* Effect.annotateCurrentSpan({
									messageCount: Array.length(prompt.messages),
									model: prompt.model,
									provider: prompt.provider,
									thinkingLevel: prompt.thinkingLevel ?? 'default'
								})
								yield* SubscriptionRefService.set(history, prompt.messages)
								yield* setStatus('running')

								return (
									input.prompt?.(prompt) ??
									Stream.make(Response.makePart('text-delta', {delta: input.response ?? 'mock response', id: 'text'}))
								).pipe(Stream.ensuring(setStatus('idle')))
							})
						).pipe(Stream.withSpan('Agent.prompt')),
					status
				}
			})
		)
	}
}

const agentCommandProfiles = [
	new AgentCommandProfile({icon: 'opencode', id: 'opencode-gpt-5.5', label: 'opencode'}),
	new AgentCommandProfile({icon: 'codex', id: 'codex-gpt-5.5-low', label: 'codex'}),
	new AgentCommandProfile({icon: 'pi', id: 'pi-gpt-5.5-low', label: 'pi'})
] as const

type AgentCommandMock = {
	readonly command: (input: AgentCommandRequest) => Effect.Effect<ChildProcess.StandardCommand, AiError>
	readonly profiles: readonly AgentCommandProfile[]
}

function commandForProfile(id: AgentCommandProfileId, cwd: string) {
	if (id === 'opencode-gpt-5.5') {
		return ChildProcess.make('opencode', ['--model', 'openai/gpt-5.5'], {cwd})
	}
	if (id === 'codex-gpt-5.5-low') {
		return ChildProcess.make(
			'codex',
			['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--dangerously-bypass-approvals-and-sandbox'],
			{cwd}
		)
	}

	return ChildProcess.make('pi', ['--provider', 'openai-codex', '--model', 'gpt-5.5:low'], {cwd})
}

export class AgentCommand extends Context.Service<AgentCommand>()('@deslop/ai/service/AgentCommand', {
	make: Effect.gen(function* () {
		const profiles: readonly AgentCommandProfile[] = agentCommandProfiles

		return {
			command: Effect.fn('AgentCommand.command')(function* (input: AgentCommandRequest) {
				const profile = Array.findFirst(agentCommandProfiles, candidate => candidate.id === input.profileId)
				if (Option.isNone(profile)) {
					return yield* new AiError({message: `Unknown agent command profile: ${input.profileId}`})
				}

				return commandForProfile(profile.value.id, input.cwd)
			}),
			profiles: Effect.succeed(profiles)
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
	public static layerMock(input: AgentCommandMock) {
		return Layer.succeed(this, {
			command: Effect.fn('AgentCommand.mock.command')(input.command),
			profiles: Effect.succeed(input.profiles)
		})
	}
}
