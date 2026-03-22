import {Effect, FiberHandle, pipe, RcMap, Stream} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import type {AgentToolKit} from '@ai-toolkit/ai/tools'
import {makeResumableStream} from '@ai-toolkit/ai/utils'
import type {AiError, Prompt, Response} from 'effect/unstable/ai'

import {RpcContracts} from '#rpcs/contracts.ts'

const conversationRcMap = RcMap.make({
	lookup: Effect.fnUntraced(function* () {
		type AgentPart = Response.StreamPart<typeof AgentToolKit.tools>
		type AgentEvent = Prompt.Message | AgentPart

		const agent = yield* Agent
		const handle = yield* FiberHandle.make<void, AiError.AiError>()
		const resumable = yield* makeResumableStream<AgentEvent>()

		return {
			prompt: Effect.fnUntraced(function* (messages: Prompt.Message[]) {
				yield* Effect.forEach(messages, resumable.append)
				yield* FiberHandle.run(handle, pipe(agent.streamText(messages), Stream.tap(resumable.append), Stream.runDrain))
			}, Effect.asVoid),
			stop: FiberHandle.clear(handle),
			stream: resumable.stream
		}
	})
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const conversation = yield* RcMap.get(yield* conversationRcMap, void 0)

		return RpcContracts.of({
			'agent.prompt': payload => conversation.prompt([payload]),
			'agent.stop': () => conversation.stop,
			'agent.events': () => conversation.stream
		})
	})
)
