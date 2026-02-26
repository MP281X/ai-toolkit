import {Effect} from 'effect'

import {Agent, Model} from '@ai-toolkit/ai/service'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		const agent = yield* Agent

		return AiContracts.of({
			'ai.listMessages': () => agent.history,
			'ai.sendMessage': input => {
				return Effect.provide(
					agent.prompt([...input.parts]),
					Model.Default({provider: input.provider, model: input.model})
				)
			},
			'ai.tool': approval => {
				return Effect.provide(
					agent.respond(approval),
					Model.Default({provider: 'openrouter', model: 'openai/gpt-oss-20b:free'})
				)
			}
		})
	})
)
