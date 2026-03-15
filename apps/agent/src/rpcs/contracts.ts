import {Schema} from 'effect'

import {ToolKit} from '@ai-toolkit/ai/schema'
import {AiError, Prompt, Response} from 'effect/unstable/ai'
import {Rpc, RpcGroup} from 'effect/unstable/rpc'

export class RpcContracts extends RpcGroup.make(
	Rpc.make('agent.prompt', {
		payload: Prompt.UserMessage,
		error: AiError.AiError
	}),
	Rpc.make('agent.stop'),
	Rpc.make('agent.events', {
		stream: true,
		error: AiError.AiError,
		success: Schema.Union([Prompt.Message, Response.StreamPart(ToolKit)])
	})
) {}
