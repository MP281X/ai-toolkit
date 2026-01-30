import { RpcGroup } from '@effect/rpc'
import { AiRpcs } from '#core/ai/contracts.ts'

export const Rpcs = RpcGroup.make().merge(AiRpcs)
