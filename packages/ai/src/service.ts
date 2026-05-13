import type {DateTime, Stream, SubscriptionRef} from 'effect'
import {Context, Effect, flow, Layer, Match, pipe} from 'effect'

import type {Response, Toolkit} from 'effect/unstable/ai'
import {LanguageModel, Prompt} from 'effect/unstable/ai'

import {resolveLanguageModel} from '#lib/language-model.ts'
import {serializeAiPartToMarkdown} from '#lib/utils.ts'
import type {AgentToolKit} from '#tools/contracts.ts'
import {makeLayerCodex} from './agents/codex.ts'
import {makeLayerEffect} from './agents/effect.ts'
import type {AgentId, ModelId, ProviderId} from './catalog.ts'

export type AgentStatus = {
	readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
	readonly updatedAt: DateTime.Utc
}

export class Agent extends Context.Service<
	Agent,
	{
		readonly status: SubscriptionRef.SubscriptionRef<AgentStatus>
		readonly history: Effect.Effect<readonly Prompt.Message[]>
		readonly streamText: (input: {
			readonly provider: ProviderId
			readonly model: ModelId
			readonly messages: readonly Prompt.Message[]
		}) => Stream.Stream<Response.StreamPart<Toolkit.Tools<typeof AgentToolKit>>>
	}
>()('@ai-toolkit/ai/service/Agent') {
	static layer(config: {readonly agent: AgentId; readonly cwd: string; readonly systemPrompt: Prompt.SystemMessage}) {
		return pipe(
			Match.value(config),
			Match.when({agent: 'codex'}, input => Agent.layerCodex({cwd: input.cwd, systemPrompt: input.systemPrompt})),
			Match.when({agent: 'effect'}, input => Agent.layerEffect({cwd: input.cwd, systemPrompt: input.systemPrompt})),
			Match.exhaustive
		)
	}

	static layerEffect = flow(makeLayerEffect, Layer.effect(this))
	static layerCodex = flow(makeLayerCodex, Layer.effect(this))
}

export class Compaction extends Context.Service<Compaction>()('@ai-toolkit/ai/service/Compaction', {
	make: Effect.fnUntraced(function* (config: {readonly model: ModelId; readonly provider: ProviderId}) {
		return {
			compact: (input: {readonly intent: string; readonly messages: readonly Prompt.Message[]}) => {
				return pipe(
					LanguageModel.generateText({
						prompt: Prompt.fromMessages([
							Prompt.makeMessage('system', {
								content:
									'You compact conversation history into a concise handoff summary. Keep only details relevant to the requested intent. Remove chatter, duplicated context, failed attempts that no longer matter, and tool noise.'
							}),
							Prompt.makeMessage('user', {
								content: [
									Prompt.makePart('text', {
										text: `Intent:\n${input.intent}\n\nConversation:\n${serializeAiPartToMarkdown(input.messages).markdown}`
									})
								]
							})
						])
					}),
					Effect.map(response => Prompt.makeMessage('system', {content: response.text})),
					Effect.provide(resolveLanguageModel({provider: config.provider, model: config.model}))
				)
			}
		}
	})
}) {
	static layer = flow(this.make, Layer.effect(this))
}
