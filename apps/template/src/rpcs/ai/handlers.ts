import {Effect, Layer, pipe} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = pipe(
	AiContracts.toLayer(
		Effect.gen(function* () {
			const agent = yield* Agent

			return AiContracts.of({
				'ai.events': () => agent.stream,
				'ai.sendMessage': input => agent.prompt(input),
				'ai.tool': response => agent.respond(response)
			})
		})
	),
	Layer.provide(Agent.layer({agent: 'copilot', provider: 'copilot', model: 'gpt-5-mini'}))
	// Layer.provide(Agent.layer({agent: 'ai', provider: 'openrouter', model: 'openrouter/free'}))
)
