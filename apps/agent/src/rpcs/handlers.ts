import {Effect, FiberHandle, pipe, Stream} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import type {AgentToolKit} from '@ai-toolkit/ai/tools'
import {makeResumableStream} from '@ai-toolkit/ai/utils'
import type {AiError, Prompt, Response} from 'effect/unstable/ai'

import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		type AgentPart = Response.StreamPart<typeof AgentToolKit.tools>

		const agent = yield* Agent
		const handle = yield* FiberHandle.make<void, AiError.AiError>()
		const resumable = yield* makeResumableStream<Prompt.Message | AgentPart>()

		yield* Effect.forEach(yield* agent.history, resumable.append)

		return RpcContracts.of({
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				yield* resumable.append(payload.message)
				yield* FiberHandle.run(
					handle,
					pipe(agent.streamText([payload.message]), Stream.tap(resumable.append), Stream.runDrain)
				)
			}),
			'agent.stop': () => FiberHandle.clear(handle),
			'agent.events': () => resumable.stream
		})
	})
)
