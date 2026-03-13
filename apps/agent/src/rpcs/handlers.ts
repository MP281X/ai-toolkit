import {Effect} from 'effect'

import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		return RpcContracts.of({
			//
		})
	})
)
