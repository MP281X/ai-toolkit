import {Context, Effect, Layer, Match, pipe} from 'effect'
import type {Exit, Option, SubscriptionRef} from 'effect'

import type {ChildProcess} from 'effect/unstable/process'

import {makeLayerClaude} from './agents/claude.ts'
import {makeLayerCodex} from './agents/codex.ts'
import {
	type AgentError,
	type AgentLayerConfig,
	type AgentProvider,
	type AgentSubscription,
	type AgentUsageData
} from './schema.ts'
import {makeLayerClaudeUsage} from './usage/claude.ts'
import {makeLayerCodexUsage} from './usage/codex.ts'

export class Agent extends Context.Service<
	Agent,
	{readonly create: Effect.Effect<ChildProcess.StandardCommand, AgentError>}
>()('@deslop/agent/service/Agent') {
	public static layer(config: AgentLayerConfig) {
		return pipe(
			Match.value(config),
			Match.when({provider: 'codex'}, input => Agent.layerCodex(input)),
			Match.when({provider: 'claude'}, input => Agent.layerClaude(input)),
			Match.exhaustive
		)
	}

	public static layerCodex = (config: AgentLayerConfig) =>
		Layer.effect(this, pipe(makeLayerCodex(config), Effect.map(Agent.of)))

	public static layerClaude = (config: AgentLayerConfig) =>
		Layer.effect(this, pipe(makeLayerClaude(config), Effect.map(Agent.of)))
}

export class AgentUsage extends Context.Service<
	AgentUsage,
	{
		readonly subscription: Effect.Effect<AgentSubscription, AgentError>
		readonly usage: SubscriptionRef.SubscriptionRef<Option.Option<Exit.Exit<AgentUsageData, AgentError>>>
	}
>()('@deslop/agent/service/AgentUsage') {
	public static layer(config: {readonly provider: AgentProvider}) {
		return pipe(
			Match.value(config),
			Match.when({provider: 'codex'}, input => AgentUsage.layerCodex(input)),
			Match.when({provider: 'claude'}, input => AgentUsage.layerClaude(input)),
			Match.exhaustive
		)
	}

	public static layerCodex = (config: {readonly provider: 'codex'}) =>
		Layer.effect(this, pipe(makeLayerCodexUsage(config), Effect.map(AgentUsage.of)))

	public static layerClaude = (config: {readonly provider: 'claude'}) =>
		Layer.effect(this, pipe(makeLayerClaudeUsage(config), Effect.map(AgentUsage.of)))
}
