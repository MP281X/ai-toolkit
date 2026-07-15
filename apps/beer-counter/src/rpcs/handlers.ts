import {Effect} from 'effect'

import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(Effect.succeed(RpcContracts.of({})))
