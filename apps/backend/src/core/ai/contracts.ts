import { AiSdkError } from '@ai-toolkit/ai'
import { AiParts } from '@ai-toolkit/ai/schemas'
import { Rpc, RpcGroup } from '@effect/rpc'

export const AiRpcs = RpcGroup.make(
	Rpc.make('stream', {
		stream: true,
		success: AiParts,
		error: AiSdkError
	})
).prefix('ai.')
