import {Schema} from 'effect'

import {WebFetchToolKit, WebSearchToolKit} from '@ai-toolkit/ai/tools'
import {AiError, Prompt, Response, Toolkit} from 'effect/unstable/ai'
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
		success: Schema.Union([Prompt.Message, Response.StreamPart(Toolkit.merge(WebSearchToolKit, WebFetchToolKit))])
	})
) {}
