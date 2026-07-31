import {
	Context,
	DateTime,
	Effect,
	FileSystem,
	Layer,
	Path,
	Schedule,
	Schema,
	Stream,
	SubscriptionRef,
	pipe
} from 'effect'

import {getAgentDir} from '@earendil-works/pi-coding-agent'
import type {Prompt, Toolkit} from 'effect/unstable/ai'
import {HttpClient} from 'effect/unstable/http'

import {makePi} from './internal/pi.ts'
import {AgentError, AgentQuota} from './schema.ts'

export declare namespace Agent {
	export type Config = {
		readonly id?: string
		readonly cwd: string
		readonly sessionDirectory: string
		readonly model: string
		readonly reasoningEffort: string
		readonly systemPrompt: string
		readonly toolkit: Toolkit.Any
	}
}

export class Agent extends Context.Service<
	Agent,
	{
		readonly id: string
		readonly history: SubscriptionRef.SubscriptionRef<readonly Prompt.Message[]>
		readonly prompt: (message: Prompt.UserMessage) => Effect.Effect<Prompt.AssistantMessage, AgentError>
		readonly status: SubscriptionRef.SubscriptionRef<'idle' | 'running' | 'retrying'>
		readonly steer: (message: Prompt.UserMessage) => Effect.Effect<void, AgentError>
	}
>()('@deslop/agent/service/Agent') {
	public static make = makePi
	public static layer = (config: Agent.Config) => Layer.effect(this, this.make(config))
}

export declare namespace AgentUsage {
	export type Config = {readonly provider: 'openai-codex'}
}

const PiCredentials = Schema.Struct({
	'openai-codex': Schema.Struct({access: Schema.String, type: Schema.Literal('oauth')})
})

const UsageResponse = Schema.Struct({
	plan_type: Schema.optional(Schema.NullOr(Schema.String)),
	rate_limit: Schema.Struct({secondary_window: Schema.Struct({reset_at: Schema.Finite, used_percent: Schema.Finite})})
})

export class AgentUsage extends Context.Service<AgentUsage>()('@deslop/agent/service/AgentUsage', {
	make: Effect.fnUntraced(function* (_config: AgentUsage.Config) {
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const client = yield* HttpClient.HttpClient

		const load = Effect.fn('AgentUsage.load')(function* () {
			const credentials = yield* pipe(
				fs.readFileString(path.join(getAgentDir(), 'auth.json')),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(PiCredentials))),
				Effect.mapError(cause => AgentError.make({cause, message: 'Pi is not signed in to OpenAI Codex'}))
			)
			const response = yield* pipe(
				client.get('https://chatgpt.com/backend-api/wham/usage', {
					headers: {authorization: `Bearer ${credentials['openai-codex'].access}`}
				}),
				Effect.mapError(cause => AgentError.make({cause, message: 'failed to load subscription usage'}))
			)
			if (response.status !== 200) {
				return yield* AgentError.make({message: `subscription usage responded with status ${response.status}`})
			}
			const usage = yield* pipe(
				response.json,
				Effect.flatMap(Schema.decodeUnknownEffect(UsageResponse)),
				Effect.mapError(cause => AgentError.make({cause, message: 'invalid subscription usage response'}))
			)
			return AgentQuota.make({
				plan: usage.plan_type ?? undefined,
				weeklyRemaining: Math.max(0, 100 - usage.rate_limit.secondary_window.used_percent),
				weeklyResetAt: DateTime.makeUnsafe(usage.rate_limit.secondary_window.reset_at * 1_000)
			})
		})

		const quota = yield* SubscriptionRef.make(yield* Effect.exit(load()))
		yield* pipe(
			Stream.fromEffect(Effect.exit(load())),
			Stream.repeat(Schedule.spaced('10 minutes')),
			Stream.runForEach(value => SubscriptionRef.set(quota, value)),
			Effect.forkScoped
		)
		return {quota}
	})
}) {
	public static layer = (config: AgentUsage.Config) => Layer.effect(this, this.make(config))
}
