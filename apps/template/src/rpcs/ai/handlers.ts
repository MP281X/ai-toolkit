import {Effect, Layer} from 'effect'

// import {AiSdkAgent, AiSdkModel} from '@ai-toolkit/ai/agents/ai-sdk'
import {CopilotSdkAgent, CopilotSdkModel} from '@ai-toolkit/ai/agents/copilot-sdk'
import {Agent} from '@ai-toolkit/ai/service'

import {AiContracts} from '#rpcs/ai/contracts.ts'

export const AiLive = AiContracts.toLayer(
	Effect.gen(function* () {
		const agent = yield* Agent

		return AiContracts.of({
			'ai.listMessages': () => agent.history,
			'ai.sendMessage': input => agent.prompt(input),
			'ai.tool': response => agent.respond([response])
		})
	})
).pipe(
	// Layer.provide(AiSdkAgent.layer),
	// Layer.provide(AiSdkModel.layer({provider: 'openrouter', model: 'openai/gpt-oss-20b:free'}))
	Layer.provide(CopilotSdkAgent.layer),
	Layer.provide(CopilotSdkModel.layer({agent: 'copilot', provider: 'copilot', model: 'gpt-5-mini'}))
)
