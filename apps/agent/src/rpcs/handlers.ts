import {Effect} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'

import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const agent = yield* Agent

		return RpcContracts.of({
			'agent.prompt': payload => agent.prompt([payload]),
			'agent.stop': () => agent.stop,
			'agent.events': () => agent.events
		})
	})
)
